import { contextBridge, ipcRenderer } from "electron"

type ResponsePayload = {
  id: string
  text: string
  createdAt: number
  source: "cursor" | "manual"
}

contextBridge.exposeInMainWorld("hearbackDesktop", {
  isDesktop: true,
  cursorStatus: () => ipcRenderer.invoke("hearback:cursor-status"),
  connectCursor: () => ipcRenderer.invoke("hearback:cursor-connect"),
  disconnectCursor: () => ipcRenderer.invoke("hearback:cursor-disconnect"),
  readClipboard: () => ipcRenderer.invoke("hearback:read-clipboard"),
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
})
