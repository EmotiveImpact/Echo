export type VoiceOption = {
  uri: string
  name: string
  lang: string
  local: boolean
  english: boolean
}

export function listVoices(): VoiceOption[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return []

  return window.speechSynthesis
    .getVoices()
    .map((voice) => ({
      uri: voice.voiceURI,
      name: cleanVoiceName(voice.name),
      lang: voice.lang,
      local: voice.localService,
      english: voice.lang.toLowerCase().startsWith("en"),
    }))
    .sort((a, b) => {
      if (a.english !== b.english) return a.english ? -1 : 1
      if (a.local !== b.local) return a.local ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function findVoice(uri: string | null): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (uri) {
    const match = voices.find((voice) => voice.voiceURI === uri)
    if (match) return match
  }
  return pickDefaultVoice(voices)
}

export function pickDefaultVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  const ranked = [
    /Google US English/i,
    /Microsoft (Aria|Jenny|Andrew|Guy)/i,
    /Samantha/i,
    /Karen/i,
    /Daniel/i,
    /Enhanced/i,
    /en-US/i,
    /^en[-_]/i,
  ]

  for (const pattern of ranked) {
    const match = voices.find(
      (voice) => pattern.test(voice.name) || pattern.test(voice.lang)
    )
    if (match) return match
  }

  return voices[0] ?? null
}

function cleanVoiceName(name: string): string {
  return name
    .replace(/^Google\s+/i, "")
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online\s+\(Natural\)\s+-\s+/i, " ")
    .replace(/\s+\(.*\)$/, "")
    .trim()
}
