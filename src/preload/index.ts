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
  },
  iso: {
    create: (opts: unknown) => ipcRenderer.invoke('iso:create', opts),
  },
  fs: {
    pickFile:   (filter?: string[]) => ipcRenderer.invoke('fs:pickFile', filter),
    pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
    readFile:   (path: string) => ipcRenderer.invoke('fs:readFile', path),
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch: unknown) => ipcRenderer.invoke('prefs:set', patch),
  },
})
