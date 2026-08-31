import type { VoiceOption } from "@/lib/voices"

export const DEFAULT_VOICE = "en-US-AriaNeural"

export const NEURAL_VOICES: VoiceOption[] = [
  { uri: "en-US-AriaNeural", name: "Aria", lang: "en-US", local: false, english: true },
  { uri: "en-US-JennyNeural", name: "Jenny", lang: "en-US", local: false, english: true },
  { uri: "en-US-AndrewNeural", name: "Andrew", lang: "en-US", local: false, english: true },
  { uri: "en-US-EmmaNeural", name: "Emma", lang: "en-US", local: false, english: true },
  { uri: "en-US-GuyNeural", name: "Guy", lang: "en-US", local: false, english: true },
  { uri: "en-GB-SoniaNeural", name: "Sonia", lang: "en-GB", local: false, english: true },
  { uri: "en-GB-RyanNeural", name: "Ryan", lang: "en-GB", local: false, english: true },
]

export function resolveVoice(input: unknown): string {
  if (typeof input === "string" && NEURAL_VOICES.some((voice) => voice.uri === input)) {
    return input
  }
  return DEFAULT_VOICE
}

export function localeFromVoice(voice: string): string {
  const [lang, region] = voice.split("-")
  if (lang && region) return `${lang}-${region}`
  return "en-US"
}
