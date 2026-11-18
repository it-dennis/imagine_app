import type { DiskFile, System, VirtualDisk } from '../../shared/types'
import { DIALECTS, checkRoundTrip, guessDialect, tokenize, type DialectId, type LineIssue } from './lang/basic'
import { bytesToText, detectSeparator, separatorFor, textToBytes, type Separator } from './lang/text-codec'

export type EditorKind = 'basic' | 'text' | 'asm'

export type FileRef = Pick<DiskFile, 'name' | 'path' | 'startTrack' | 'startSector'>

export interface EditorDoc {
  /** Changes whenever a different document is opened; used to rebuild the editor view. */
  id: string
  kind: EditorKind
  diskId: string
  system: System
  /** null until a new file has been saved for the first time. */
  ref: FileRef | null
  name: string
  fileType: DiskFile['type']
  text: string
  savedText: string
  /** Hash of the file bytes as loaded or last saved; sent along on save to detect outside changes. */
  sha256: string | null
  dialect: DialectId
  loadAddress: number
  separator: Separator
  /** Set when the file cannot be edited safely; the reason is shown and the editor is read-only. */
  readOnlyReason: string | null
}

let counter = 0
const nextId = () => `doc-${++counter}`

export const isDirty = (doc: EditorDoc | null): boolean => !!doc && doc.text !== doc.savedText

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const b64 = {
  encode(bytes: Uint8Array): string {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  },
  decode(text: string): Uint8Array {
    const s = atob(text)
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  },
}

/** Default BASIC start address of a system for the given dialect (VIC-20 and Plus/4 start at $1001). */
export function defaultLoadAddress(system: System, dialect: DialectId): number {
  if (dialect === 'v2' && system === 'vic20') return 0x1001
  return DIALECTS[dialect].loadAddress
}

/** Which dialect a new BASIC program on this system should use. */
export function defaultDialect(system: System): DialectId {
  return system === 'plus4' ? 'v35' : system === 'c128' ? 'v70' : 'v2'
}

const PROBLEM_TEXT: Record<string, string> = {
  malformed: 'Die Zeilenverkettung dieses Programms ist beschädigt. Es wird nur angezeigt; bearbeite es im Hex-Tab.',
  trailer: 'Hinter dem BASIC-Programm folgen weitere Bytes (meist Maschinencode). Beim Speichern würden sie verschoben und das Programm damit zerstört. Es wird nur angezeigt.',
  'not-lossless': 'Dieses Programm lässt sich nicht verlustfrei als Text darstellen (z. B. ausgeschriebene Schlüsselwörter ohne Token). Es wird nur angezeigt, damit beim Speichern nichts verfälscht wird.',
}

export async function loadDocument(disk: VirtualDisk, file: DiskFile, kind: EditorKind): Promise<EditorDoc> {
  const ref: FileRef = { name: file.name, path: file.path, startTrack: file.startTrack, startSector: file.startSector }
  const { data, sha256 } = await window.imagineAPI.disk.openFile(disk.id, ref)
  const bytes = b64.decode(data)
  const common = { id: nextId(), diskId: disk.id, system: disk.system, ref, name: file.path ?? file.name, fileType: file.type, sha256 }

  if (kind === 'basic') {
    const loadAddress = bytes.length >= 2 ? bytes[0] | (bytes[1] << 8) : defaultLoadAddress(disk.system, defaultDialect(disk.system))
    const dialect = guessDialect(loadAddress, disk.system)
    const rt = checkRoundTrip(bytes, DIALECTS[dialect])
    return {
      ...common, kind, text: rt.text, savedText: rt.text, dialect, loadAddress: rt.loadAddress,
      separator: '\n', readOnlyReason: rt.problem ? PROBLEM_TEXT[rt.problem] : null,
    }
  }

  const text = bytesToText(bytes)
  const separator = detectSeparator(text, separatorFor(disk.system))
  return {
    ...common, kind, text, savedText: text, dialect: defaultDialect(disk.system),
    loadAddress: 0, separator, readOnlyReason: null,
  }
}

export function newDocument(disk: VirtualDisk, name: string, kind: EditorKind): EditorDoc {
  const dialect = defaultDialect(disk.system)
  const cbm = ['c64', 'vic20', 'plus4', 'c128'].includes(disk.system)
  return {
    id: nextId(), kind, diskId: disk.id, system: disk.system, ref: null, name,
    fileType: kind === 'basic' ? 'PRG' : cbm ? 'SEQ' : 'FILE',
    text: '', savedText: '', sha256: null, dialect,
    loadAddress: kind === 'basic' ? defaultLoadAddress(disk.system, dialect) : 0,
    // BASIC text is always split on LF; the CR convention only applies to plain files on the disk
    separator: kind === 'basic' ? '\n' : separatorFor(disk.system), readOnlyReason: null,
  }
}

export interface EncodeResult {
  bytes?: Uint8Array
  errors: LineIssue[]
  warnings: LineIssue[]
}

/** Turns the editor text into the bytes that get written to the disk. */
export function encodeDocument(doc: EditorDoc): EncodeResult {
  if (doc.kind === 'basic') {
    const t = tokenize(doc.text, DIALECTS[doc.dialect], doc.loadAddress)
    return { bytes: t.errors.length ? undefined : t.prg, errors: t.errors, warnings: t.warnings }
  }
  const enc = textToBytes(doc.text)
  if (enc.badChar) {
    const line = doc.text.slice(0, enc.badChar.index).split(/\r\n|\r|\n/).length
    return { errors: [{ line, message: `Zeichen "${enc.badChar.char}" passt nicht in ein Byte (nur Latin-1 möglich).` }], warnings: [] }
  }
  return { bytes: enc.bytes, errors: [], warnings: [] }
}

export interface SaveResult {
  doc: EditorDoc
  disk: VirtualDisk
}

/** Writes the document to its disk. Throws an Error with a readable message on any failure. */
export async function saveDocument(doc: EditorDoc): Promise<SaveResult> {
  if (doc.readOnlyReason) throw new Error('Diese Datei ist schreibgeschützt geöffnet.')
  const enc = encodeDocument(doc)
  if (!enc.bytes) throw new Error(enc.errors.map((e) => `Zeile ${e.line}: ${e.message}`).join('\n') || 'Speichern nicht möglich.')
  const data = b64.encode(enc.bytes)
  const result = doc.ref
    ? await window.imagineAPI.disk.saveFile(doc.diskId, doc.ref, data, doc.sha256 ?? '')
    : await window.imagineAPI.disk.createFile(doc.diskId, { name: doc.name, type: doc.fileType }, data)
  const { file, disk } = result
  const next: EditorDoc = {
    ...doc,
    ref: { name: file.name, path: file.path, startTrack: file.startTrack, startSector: file.startSector },
    savedText: doc.text,
    sha256: await sha256Hex(enc.bytes),
  }
  return { doc: next, disk }
}
