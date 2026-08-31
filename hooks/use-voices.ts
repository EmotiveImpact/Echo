"use client"

import { NEURAL_VOICES } from "@/lib/neural-voices"

export function useVoices() {
  return { voices: NEURAL_VOICES, ready: true }
}
