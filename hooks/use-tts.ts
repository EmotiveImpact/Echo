"use client"

import { useSyncExternalStore } from "react"
import { tts } from "@/lib/tts-engine"

export function useTts() {
  return useSyncExternalStore(
    tts.subscribe,
    tts.getSnapshot,
    tts.getServerSnapshot
  )
}

