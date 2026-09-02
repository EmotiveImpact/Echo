import { contextBridge, ipcRenderer } from "electron"

type ResponsePayload = {
  id: string
  text: string
  createdAt: number
  source: "cursor" | "manual"
}

type ShortcutStatus = {
  captureAccelerator: string | null
  openAccelerator: string | null
  captureRegistered: boolean
  openRegistered: boolean
  clipboardWatch: boolean
}

contextBridge.exposeInMainWorld("hearbackDesktop", {
  isDesktop: true,
  cursorStatus: () => ipcRenderer.invoke("hearback:cursor-status"),
  connectCursor: () => ipcRenderer.invoke("hearback:cursor-connect"),
  disconnectCursor: () => ipcRenderer.invoke("hearback:cursor-disconnect"),
  readClipboard: () => ipcRenderer.invoke("hearback:read-clipboard"),
  azureStatus: () => ipcRenderer.invoke("hearback:azure-status"),
  saveAzure: (credentials: { key: string; region: string }) =>
    ipcRenderer.invoke("hearback:azure-save", credentials),
  clearAzure: () => ipcRenderer.invoke("hearback:azure-clear"),
  synthesize: (text: string, voice: string) =>
    ipcRenderer.invoke("hearback:tts-synthesize", text, voice),
  shortcutStatus: () => ipcRenderer.invoke("hearback:shortcut-status"),
  setClipboardWatch: (enabled: boolean) =>
    ipcRenderer.invoke("hearback:set-clipboard-watch", enabled),
  onResponse: (callback: (response: ResponsePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, response: ResponsePayload) =>
      callback(response)
    ipcRenderer.on("hearback:response", listener)
    return () => ipcRenderer.removeListener("hearback:response", listener)
  },
  onCursorError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) =>
      callback(message)
    ipcRenderer.on("hearback:cursor-error", listener)
    return () => ipcRenderer.removeListener("hearback:cursor-error", listener)
  },
  onShortcutStatus: (callback: (status: ShortcutStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ShortcutStatus) =>
      callback(status)
    ipcRenderer.on("hearback:shortcut-status", listener)
    return () => ipcRenderer.removeListener("hearback:shortcut-status", listener)
  },
})
