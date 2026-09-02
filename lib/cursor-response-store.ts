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
let consecutiveFailures = 0
const listeners = new Set<() => void>()

function desktopBridgeAvailable() {
  return typeof window !== "undefined" && Boolean(window.hearbackDesktop)
}

export function subscribeCursorResponses(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (desktopBridgeAvailable()) {
      replace({
        responses: snapshot.responses,
        status: "ready",
        error: null,
      })
    } else {
      void refresh()
      timer = setInterval(() => void refresh(), 1200)
    }
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
  if (desktopBridgeAvailable()) {
    if (snapshot.status === "error" || snapshot.error) {
      replace({
        responses: snapshot.responses,
        status: snapshot.responses.length > 0 ? "connected" : "ready",
        error: null,
      })
    }
    return
  }
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
    consecutiveFailures = 0
    replace({
      responses,
      status: responses.length > 0 ? "connected" : "ready",
      error: null,
    })
  } catch (error) {
    consecutiveFailures += 1
    if (consecutiveFailures < 3 && snapshot.status !== "error") {
      return
    }
    replace({
      responses: snapshot.responses,
      status: "error",
      error: bridgeError(error),
    })
  } finally {
    requestInFlight = false
  }
}

function bridgeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  if (
    raw === "Failed to fetch" ||
    raw === "Load failed" ||
    raw === "NetworkError when attempting to fetch resource." ||
    raw.includes("NetworkError")
  ) {
    return "Hearback cannot reach its local server. Reopen the Mac app, or run npm run dev if you are in a browser."
  }
  return raw
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
