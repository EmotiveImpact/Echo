import { DEFAULT_VOICE } from "@/lib/neural-voices"

export type SavedReply = {
  id: string
  createdAt: number
  text: string
  source?: "cursor" | "manual"
}

export type HearbackSettings = {
  voiceURI: string | null
  rate: number
  skipCode: boolean
  skipUrls: boolean
}

export type HearbackStore = {
  replies: SavedReply[]
  settings: HearbackSettings
}

const KEY = "hearback:v3"
const MAX_REPLIES = 40

export const defaultSettings: HearbackSettings = {
  voiceURI: DEFAULT_VOICE,
  rate: 1.05,
  skipCode: true,
  skipUrls: true,
}

export function loadStore(): HearbackStore {
  if (typeof window === "undefined") {
    return { replies: [], settings: defaultSettings }
  }

  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { replies: [], settings: defaultSettings }
    const parsed = JSON.parse(raw) as Partial<HearbackStore>
    return {
      replies: Array.isArray(parsed.replies) ? parsed.replies.slice(0, MAX_REPLIES) : [],
      settings: { ...defaultSettings, ...parsed.settings },
    }
  } catch {
    return { replies: [], settings: defaultSettings }
  }
}

export function saveStore(store: HearbackStore) {
  if (typeof window === "undefined") return
  const next: HearbackStore = {
    settings: store.settings,
    replies: store.replies.slice(0, MAX_REPLIES),
  }
  window.localStorage.setItem(KEY, JSON.stringify(next))
}
