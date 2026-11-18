import type { TFunction } from 'i18next'
import { useEditorStore } from '../state/editor.store'
import { useUIStore } from '../state/ui.store'
import { useWorkspaceStore } from '../state/workspace.store'
import { defaultDialect, defaultLoadAddress, isDirty, loadDocument, saveDocument } from './editor-doc'
import { assemble } from './lang/assembler'
import { emulatorSystemFor, launchEmulator } from './emulator-actions'

const errorText = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** Saves the open document. Returns false (and shows why) when nothing was written. */
export async function saveCurrent(t: TFunction): Promise<boolean> {
  const { doc, patch, setSaveError } = useEditorStore.getState()
  if (!doc || !isDirty(doc)) return true
  const textAtSave = doc.text
  try {
    const { doc: saved, disk } = await saveDocument(doc)
    useWorkspaceStore.getState().updateDisk(disk)
    // keep whatever was typed while the save was running
    patch({ ref: saved.ref, sha256: saved.sha256, savedText: textAtSave })
    setSaveError(null)
    useUIStore.getState().addToast({ intent: 'success', title: t('edSaved'), description: doc.name, duration: 2500 })
    return true
  } catch (err) {
    const message = errorText(err)
    setSaveError(message)
    useUIStore.getState().addToast({ intent: 'danger', title: t('toastErrorTitle'), description: message })
    return false
  }
}

const SOURCE_EXTENSIONS = /\.(asm|s|a65|src|txt)$/i

/** Name of the program a source file is assembled to: "TEST.ASM" -> "TEST", "TEST" -> "TEST.PRG". */
export function outputName(sourceName: string): string {
  const stripped = sourceName.replace(SOURCE_EXTENSIONS, '')
  return stripped === sourceName ? `${sourceName}.PRG` : stripped
}

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Assembles the open source, writes the program to the disk (replacing an earlier build of the same name)
 * and optionally runs it. The source is saved first so that nothing is lost if the emulator misbehaves.
 */
export async function assembleCurrent(t: TFunction, run: boolean): Promise<boolean> {
  const { doc } = useEditorStore.getState()
  if (!doc || doc.kind !== 'asm') return false
  const ui = useUIStore.getState()
  if (!(await saveCurrent(t))) return false
  const current = useEditorStore.getState().doc!

  const result = assemble(current.text, defaultLoadAddress(current.system, defaultDialect(current.system)))
  if (!result.prg) {
    const first = result.errors[0]
    ui.addToast({ intent: 'danger', title: t('edAsmFailed'), description: `${t('edLine')} ${first.line}: ${first.message}${result.errors.length > 1 ? ` (+${result.errors.length - 1})` : ''}` })
    return false
  }

  const name = outputName(current.name)
  if (name.length > 16) {
    ui.addToast({ intent: 'danger', title: t('edAsmFailed'), description: t('edNameTooLong', { name }) })
    return false
  }
  try {
    const disk = useWorkspaceStore.getState().disks.find((d) => d.id === current.diskId)
    const existing = disk?.files.find((f) => f.type === 'PRG' && (f.path ?? f.name).toUpperCase() === name.toUpperCase())
    const data = b64(result.prg)
    let updated
    if (existing) {
      const { sha256 } = await window.imagineAPI.disk.openFile(current.diskId, existing)
      updated = (await window.imagineAPI.disk.saveFile(current.diskId, existing, data, sha256)).disk
    } else {
      updated = (await window.imagineAPI.disk.createFile(current.diskId, { name, type: 'PRG' }, data)).disk
    }
    useWorkspaceStore.getState().updateDisk(updated)
    const hex4 = (n: number) => `$${n.toString(16).toUpperCase().padStart(4, '0')}`
    ui.addToast({ intent: 'success', title: t('edAssembled'), description: `${name}  ${hex4(result.origin)}-${hex4(result.end - 1)} (${result.prg.length - 2} Bytes)`, duration: 4000 })
  } catch (err) {
    ui.addToast({ intent: 'danger', title: t('toastErrorTitle'), description: errorText(err) })
    return false
  }
  if (run) await launchEmulator(t, true, name, emulatorSystemFor(current))
  return true
}

/** Saves (BASIC, text) or assembles (assembler source), then starts the emulator and runs the program. */
export async function saveAndRun(t: TFunction): Promise<void> {
  if (useEditorStore.getState().doc?.kind === 'asm') { await assembleCurrent(t, true); return }
  if (!(await saveCurrent(t))) return
  const { doc } = useEditorStore.getState()
  if (!doc) return
  await launchEmulator(t, true, doc.name, emulatorSystemFor(doc))
}

/**
 * Asks what to do with unsaved changes before they would be lost. Resolves true when it is safe to continue
 * (nothing was dirty, or the changes were saved or discarded).
 */
export async function confirmDiscard(t: TFunction, onlyDisk?: string): Promise<boolean> {
  const { doc } = useEditorStore.getState()
  if (!doc || !isDirty(doc) || (onlyDisk && doc.diskId !== onlyDisk)) return true
  const choice = await window.imagineAPI.app.confirmUnsaved(doc.name)
  if (choice === 'cancel') return false
  if (choice === 'save') return saveCurrent(t)
  return true
}

/** Throws away the editor state of the open file and reads it from the disk again. */
export async function reloadCurrent(): Promise<void> {
  const { doc, open } = useEditorStore.getState()
  if (!doc?.ref) return
  const disk = useWorkspaceStore.getState().disks.find((d) => d.id === doc.diskId)
  const file = disk?.files.find((f) =>
    doc.ref!.startTrack !== undefined
      ? f.startTrack === doc.ref!.startTrack && f.startSector === doc.ref!.startSector
      : (f.path ?? f.name) === (doc.ref!.path ?? doc.ref!.name),
  ) ?? disk?.files.find((f) => (f.path ?? f.name) === doc.name)
  if (!disk || !file) return
  open(await loadDocument(disk, file, doc.kind))
}
