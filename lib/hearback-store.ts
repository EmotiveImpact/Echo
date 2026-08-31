import {
  defaultSettings,
  loadStore,
  saveStore,
  type HearbackSettings,
  type HearbackStore,
  type SavedReply,
} from "@/lib/storage"

const listeners = new Set<() => void>()
const emptyStore: HearbackStore = {
  replies: [],
  settings: defaultSettings,
}

let clientStore: HearbackStore | null = null

function emit(next: HearbackStore) {
  clientStore = next
  saveStore(next)
  listeners.forEach((listener) => listener())
}

export function subscribeHearback(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getHearbackSnapshot(): HearbackStore {
  if (!clientStore) {
    clientStore = loadStore()
  }
  return clientStore
}

export function getHearbackServerSnapshot(): HearbackStore {
  return emptyStore
}

export function addReply(reply: SavedReply) {
  const current = getHearbackSnapshot()
  emit({ ...current, replies: [reply, ...current.replies] })
}

export function removeReply(id: string) {
  const current = getHearbackSnapshot()
  emit({
    ...current,
    replies: current.replies.filter((reply) => reply.id !== id),
  })
}

export function patchSettings(patch: Partial<HearbackSettings>) {
  const current = getHearbackSnapshot()
  emit({
    ...current,
    settings: { ...current.settings, ...patch },
  })
}
