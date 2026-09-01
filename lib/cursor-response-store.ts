"use client"

import type { SavedReply } from "@/lib/storage"

export type CursorConnectionStatus =
  | "connecting"
  | "ready"
  | "connected"
  | "error"

export type CursorResponseSnapshot = {
  responses: SavedReply[]
  status: CursorConnectionStatus
  error: string | null
}

const serverSnapshot: CursorResponseSnapshot = {
  responses: [],
  status: "connecting",
  error: null,
}

let snapshot = serverSnapshot
let timer: ReturnType<typeof setInterval> | null = null
let requestInFlight = false
const listeners = new Set<() => void>()

export function subscribeCursorResponses(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    void refresh()
    timer = setInterval(() => void refresh(), 1200)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function getCursorResponseSnapshot() {
  return snapshot
}

export function getCursorResponseServerSnapshot() {
  return serverSnapshot
}

async function refresh() {
  if (requestInFlight) return
  requestInFlight = true

  try {
    const response = await fetch("/api/cursor-responses", {
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`Response bridge returned ${response.status}.`)
    }

    const payload = (await response.json()) as { responses?: SavedReply[] }
    const responses = Array.isArray(payload.responses) ? payload.responses : []
    replace({
      responses,
      status: responses.length > 0 ? "connected" : "ready",
      error: null,
    })
  } catch (error) {
    replace({
      responses: snapshot.responses,
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Could not connect to the response bridge.",
    })
  } finally {
    requestInFlight = false
  }
}

function replace(next: CursorResponseSnapshot) {
  if (
    snapshot.status === next.status &&
    snapshot.error === next.error &&
    sameResponses(snapshot.responses, next.responses)
  ) {
    return
  }

  snapshot = next
  listeners.forEach((listener) => listener())
}

function sameResponses(a: SavedReply[], b: SavedReply[]) {
  if (a.length !== b.length) return false
  return a.every(
    (reply, index) =>
      reply.id === b[index]?.id &&
      reply.createdAt === b[index]?.createdAt &&
      reply.text === b[index]?.text
  )
}
