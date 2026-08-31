"use client"

import { useSyncExternalStore } from "react"
import { listVoices, type VoiceOption } from "@/lib/voices"

const empty: VoiceOption[] = []
let cached: VoiceOption[] = empty

function subscribe(listener: () => void) {
  const synth = window.speechSynthesis
  if (!synth) return () => {}

  synth.addEventListener("voiceschanged", listener)
  const timer = window.setTimeout(listener, 250)
  return () => {
    synth.removeEventListener("voiceschanged", listener)
    window.clearTimeout(timer)
  }
}

function getVoicesSnapshot() {
  const next = listVoices()
  const nextKey = next.map((voice) => voice.uri).join("\0")
  const prevKey = cached.map((voice) => voice.uri).join("\0")
  if (nextKey === prevKey) return cached
  cached = next
  return cached
}

export function useVoices() {
  const voices = useSyncExternalStore(subscribe, getVoicesSnapshot, () => empty)
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  return { voices, ready }
}
