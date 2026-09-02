import type { SavedReply } from "@/lib/storage"

type CursorDesktopStatus = {
  status: "connected" | "disconnected" | "expired"
  email?: string | null
  apiKeyName?: string
  expiresAtMs?: number
}

export type DesktopShortcutStatus = {
  captureAccelerator: string | null
  openAccelerator: string | null
  captureRegistered: boolean
  openRegistered: boolean
  clipboardWatch: boolean
}

type HearbackDesktopBridge = {
  isDesktop: true
  cursorStatus(): Promise<CursorDesktopStatus>
  connectCursor(): Promise<CursorDesktopStatus>
  disconnectCursor(): Promise<CursorDesktopStatus>
  readClipboard(): Promise<{ captured: boolean }>
  azureStatus(): Promise<{ configured: boolean }>
  saveAzure(credentials: {
    key: string
    region: string
  }): Promise<{ configured: boolean }>
  clearAzure(): Promise<{ configured: boolean }>
  synthesize(text: string, voice: string): Promise<Uint8Array | null>
  shortcutStatus(): Promise<DesktopShortcutStatus>
  setClipboardWatch(enabled: boolean): Promise<{ enabled: boolean }>
  onResponse(callback: (response: SavedReply) => void): () => void
  onCursorError(callback: (message: string) => void): () => void
  onShortcutStatus(callback: (status: DesktopShortcutStatus) => void): () => void
}

declare global {
  interface Window {
    hearbackDesktop?: HearbackDesktopBridge
  }
}

export {}
