import type { TFunction } from 'i18next'
import type { MenuAction } from '../../shared/types'
import { useUIStore } from '../state/ui.store'
import { usePrefsStore } from '../state/prefs.store'
import { launchEmulator } from './emulator-actions'
import { assembleCurrent, saveAndRun, saveCurrent } from './editor-actions'

/** Runs an action chosen in the native menu. Disk-dependent items are disabled in the menu while no disk is loaded. */
export async function runMenuAction(action: MenuAction, t: TFunction): Promise<void> {
  const ui = useUIStore.getState()
  switch (action) {
    case 'newDisk':       return ui.openDialog('newDisk')
    case 'openDisk':      return ui.openDialog('fileBrowser')
    case 'writeFile':     return ui.openDialog('writeFile')
    case 'format':        return ui.openDialog('format')
    case 'eject':         return ui.openDialog('delete')
    case 'iso':           return ui.openDialog('iso')
    case 'settings':      return ui.openDialog('settings')
    case 'about':         return ui.openDialog('about')
    case 'tabFiles':      return ui.setActiveTab('files')
    case 'tabBasic':      return ui.setActiveTab('basic')
    case 'tabAsm':        return ui.setActiveTab('asm')
    case 'tabText':       return ui.setActiveTab('text')
    case 'newFile':       return ui.openDialog('newFile')
    case 'save':          void saveCurrent(t); return
    case 'saveRun':       return saveAndRun(t)
    case 'assemble':      void assembleCurrent(t, false); return
    case 'saveThenClose': if (await saveCurrent(t)) await window.imagineAPI.app.closeNow(); return
    case 'tabHex':        return ui.setActiveTab('hex')
    case 'toggleSidebar': return ui.toggleSidebar()
    case 'emulatorDisk':  return launchEmulator(t, true)
    case 'emulatorBlank': return launchEmulator(t, false)
    case 'detectEmulators': {
      const found = await usePrefsStore.getState().autodetect(true)
      const names = [found.vicePath && 'VICE', found.hatariPath && 'Hatari'].filter(Boolean)
      ui.addToast({
        intent: names.length ? 'success' : 'warning',
        title: t('emuDetectDone'),
        description: names.length ? t('emuDetected', { names: names.join(', ') }) : t('emuNotDetected'),
      })
      return
    }
  }
}
