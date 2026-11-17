import type { TFunction } from 'i18next'
import { useUIStore } from '../state/ui.store'
import { useWorkspaceStore } from '../state/workspace.store'

/** With a disk: start the emulator for its system and attach it. Without: a blank session (C64 unless a disk says otherwise). */
export async function launchEmulator(t: TFunction, withDisk: boolean): Promise<void> {
  const { addToast } = useUIStore.getState()
  const { disks, activeDiskId } = useWorkspaceStore.getState()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null
  try {
    const { kind } = await window.imagineAPI.emulator.launch(
      withDisk && disk
        ? { diskId: disk.id, hasFiles: disk.files.length > 0 }
        : { system: disk?.system ?? 'c64' },
    )
    addToast({ intent: 'success', title: t('emuStarted'), description: kind === 'vice' ? 'VICE' : 'Hatari' })
  } catch (err) {
    addToast({ intent: 'danger', title: t('emuFailed'), description: err instanceof Error ? err.message : String(err) })
  }
}
