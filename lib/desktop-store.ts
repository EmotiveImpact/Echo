"use client"

import type { DesktopShortcutStatus } from "@/types/hearback-desktop"
import type { SavedReply } from "@/lib/storage"

type AuthStatus = "checking" | "connected" | "disconnected" | "expired"

const idleShortcuts: DesktopShortcutStatus = {
  captureAccelerator: null,
  openAccelerator: null,
  captureRegistered: false,
  openRegistered: false,
  clipboardWatch: true,
}

export type DesktopSnapshot = {
  available: boolean
  authStatus: AuthStatus
  email: string | null
  azureConfigured: boolean
  responses: SavedReply[]
  error: string | null
  shortcuts: DesktopShortcutStatus
  clipboardWatch: boolean
}

const serverSnapshot: DesktopSnapshot = {
  available: false,
  authStatus: "checking",
  email: null,
  azureConfigured: false,
  responses: [],
  error: null,
  shortcuts: idleShortcuts,
  clipboardWatch: true,
}

let snapshot = serverSnapshot
let teardown: (() => void) | null = null
const listeners = new Set<() => void>()

export function subscribeDesktop(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) initialize()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      teardown?.()
      teardown = null
    }
  }
}

export function getDesktopSnapshot() {
  return snapshot
}

export function getDesktopServerSnapshot() {
  return serverSnapshot
}

export async function connectCursor() {
  const bridge = window.hearbackDesktop
  if (!bridge) return
  replace({ ...snapshot, authStatus: "checking", error: null })
  try {
    const result = await bridge.connectCursor()
    replace({
      ...snapshot,
      authStatus: result.status,
      email: result.email ?? null,
      error: null,
    })
  } catch (error) {
    replace({
      ...snapshot,
      authStatus: "disconnected",
      error: message(error),
    })
  }
}

export async function disconnectCursor() {
  const bridge = window.hearbackDesktop
  if (!bridge) return
  await bridge.disconnectCursor()
  replace({
    ...snapshot,
    authStatus: "disconnected",
    email: null,
    error: null,
  })
}

export async function captureDesktopClipboard() {
  return window.hearbackDesktop?.readClipboard()
}

export async function setDesktopClipboardWatch(enabled: boolean) {
  const bridge = window.hearbackDesktop
  if (!bridge) return
  const result = await bridge.setClipboardWatch(enabled)
  replace({
    ...snapshot,
    clipboardWatch: result.enabled,
    shortcuts: { ...snapshot.shortcuts, clipboardWatch: result.enabled },
  })
}

export async function saveAzureSpeech(key: string, region: string) {
  const bridge = window.hearbackDesktop
  if (!bridge) return
  try {
    const result = await bridge.saveAzure({ key, region })
    replace({
      ...snapshot,
      azureConfigured: result.configured,
      error: null,
    })
  } catch (error) {
    replace({ ...snapshot, error: message(error) })
    throw error
  }
}

export async function clearAzureSpeech() {
  const bridge = window.hearbackDesktop
  if (!bridge) return
  const result = await bridge.clearAzure()
  replace({
    ...snapshot,
    azureConfigured: result.configured,
    error: null,
  })
}

function initialize() {
  const bridge = window.hearbackDesktop
  if (!bridge) {
    replace({
      ...serverSnapshot,
      available: false,
      authStatus: "disconnected",
    })
    return
  }

  replace({ ...snapshot, available: true, authStatus: "checking" })
  const offResponse = bridge.onResponse((response) => {
    const responses = [
      response,
      ...snapshot.responses.filter((item) => item.id !== response.id),
    ].slice(0, 40)
    replace({ ...snapshot, responses, error: null })
  })
  const offError = bridge.onCursorError((error) => {
    replace({ ...snapshot, error: error || null })
  })
  const offShortcuts = bridge.onShortcutStatus((status) => {
    replace({
      ...snapshot,
      shortcuts: status,
      clipboardWatch: status.clipboardWatch,
    })
  })
  teardown = () => {
    offResponse()
    offError()
    offShortcuts()
  }

  void Promise.all([
    bridge.cursorStatus(),
    bridge.azureStatus(),
    bridge.shortcutStatus(),
  ])
    .then(([result, azure, shortcuts]) => {
      replace({
        ...snapshot,
        authStatus: result.status,
        email: result.email ?? null,
        azureConfigured: azure.configured,
        shortcuts,
        clipboardWatch: shortcuts.clipboardWatch,
        error: null,
      })
    })
    .catch((error) => {
      replace({
        ...snapshot,
        authStatus: "disconnected",
        error: message(error),
      })
    })
}

function replace(next: DesktopSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
