import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('imagineAPI', {
  disk: {
    create: (opts: unknown) => ipcRenderer.invoke('disk:create', opts),
    open:   (path: string) => ipcRenderer.invoke('disk:open', path),
    write:  (diskId: string, sourcePath: string, target: unknown) => ipcRenderer.invoke('disk:write', diskId, sourcePath, target),
    readFile: (diskId: string, path: string) => ipcRenderer.invoke('disk:readFile', diskId, path),
    format: (diskId: string) => ipcRenderer.invoke('disk:format', diskId),
    delete: (diskId: string) => ipcRenderer.invoke('disk:delete', diskId),
    eject:  (diskId: string) => ipcRenderer.invoke('disk:eject', diskId),
    refresh: (diskId: string) => ipcRenderer.invoke('disk:refresh', diskId),
    openFile: (diskId: string, ref: unknown) => ipcRenderer.invoke('disk:openFile', diskId, ref),
    saveFile: (diskId: string, ref: unknown, data: string, expectedSha256: string) =>
      ipcRenderer.invoke('disk:saveFile', diskId, ref, data, expectedSha256),
    createFile: (diskId: string, target: unknown, data: string) => ipcRenderer.invoke('disk:createFile', diskId, target, data),
    formats: () => ipcRenderer.invoke('disk:formats'),
  },
  iso: {
    create: (opts: unknown) => ipcRenderer.invoke('iso:create', opts),
  },
  fs: {
    pickFile:   (filter?: string[]) => ipcRenderer.invoke('fs:pickFile', filter),
    pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
    readFile:   (path: string) => ipcRenderer.invoke('fs:readFile', path),
    defaultFolder: () => ipcRenderer.invoke('fs:defaultFolder'),
  },
  app: {
    setState: (state: unknown) => ipcRenderer.invoke('app:setState', state),
    info: () => ipcRenderer.invoke('app:info'),
    confirmUnsaved: (name: string) => ipcRenderer.invoke('app:confirmUnsaved', name),
    closeNow: () => ipcRenderer.invoke('app:closeNow'),
    onMenuAction: (cb: (action: string) => void) => {
      const handler = (_e: unknown, action: string) => cb(action)
      ipcRenderer.on('menu:action', handler)
      return () => ipcRenderer.removeListener('menu:action', handler)
    },
  },
  emulator: {
    launch: (opts: unknown) => ipcRenderer.invoke('emu:launch', opts),
    detect: () => ipcRenderer.invoke('emu:detect'),
    onDiskChanged: (cb: (diskId: string) => void) => {
      const handler = (_e: unknown, diskId: string) => cb(diskId)
      ipcRenderer.on('emu:diskChanged', handler)
      return () => ipcRenderer.removeListener('emu:diskChanged', handler)
    },
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch: unknown) => ipcRenderer.invoke('prefs:set', patch),
  },
})
