import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EdgeTTS } from "node-edge-tts"

import { localeFromVoice, resolveVoice } from "@/lib/neural-voices"

const MAX_CHARS = 400

export function clipSpeakableText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS)
}

export async function synthesizeMp3(rawText: string, rawVoice: unknown): Promise<Buffer> {
  const text = clipSpeakableText(String(rawText ?? ""))
  if (!text) {
    throw new Error("Nothing to speak.")
  }

  const voice = resolveVoice(rawVoice)
  const dir = await mkdtemp(join(tmpdir(), "hearback-"))
  const file = join(dir, "speech.mp3")

  try {
    const tts = new EdgeTTS({
      voice,
      lang: localeFromVoice(voice),
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      timeout: 20000,
    })
    await tts.ttsPromise(text, file)
    const audio = await readFile(file)
    if (audio.byteLength < 64) {
      throw new Error("The speech service returned empty audio.")
    }
    return audio
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
