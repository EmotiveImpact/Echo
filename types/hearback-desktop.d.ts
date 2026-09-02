import type { SavedReply } from "@/lib/storage"

type CursorDesktopStatus = {
  status: "connected" | "disconnected" | "expired"
  email?: string | null
  apiKeyName?: string
  expiresAtMs?: number
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
  onResponse(callback: (response: SavedReply) => void): () => void
  onCursorError(callback: (message: string) => void): () => void
}

declare global {
  interface Window {
    hearbackDesktop?: HearbackDesktopBridge
  }
}

export {}
