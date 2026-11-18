import type { TFunction } from 'i18next'
import { useUIStore } from '../state/ui.store'
import { useWorkspaceStore } from '../state/workspace.store'
import type { System } from '../../shared/types'
import type { EditorDoc } from './editor-doc'

/** Which machine a program needs: BASIC 7.0 runs on a C128, 3.5 on a Plus/4, V2 on a C64 (or VIC-20). */
export function emulatorSystemFor(doc: Pick<EditorDoc, 'kind' | 'dialect' | 'system'>): System {
  if (doc.kind === 'basic') {
    if (doc.dialect === 'v70') return 'c128'
    if (doc.dialect === 'v35') return 'plus4'
    return doc.system === 'vic20' ? 'vic20' : 'c64'
  }
  return doc.system
}

/** With a disk: start the emulator for its system and attach it. Without: a blank session (C64 unless a disk says otherwise). */
export async function launchEmulator(t: TFunction, withDisk: boolean, program?: string, system?: System): Promise<void> {
  const { addToast } = useUIStore.getState()
  const { disks, activeDiskId } = useWorkspaceStore.getState()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null
  try {
    const { kind } = await window.imagineAPI.emulator.launch(
      withDisk && disk
        ? { diskId: disk.id, hasFiles: disk.files.length > 0, program, system }
        : { system: disk?.system ?? 'c64' },
    )
    addToast({ intent: 'success', title: t('emuStarted'), description: kind === 'vice' ? 'VICE' : 'Hatari' })
  } catch (err) {
    addToast({ intent: 'danger', title: t('emuFailed'), description: err instanceof Error ? err.message : String(err) })
  }
}
