import { findVoice } from "@/lib/voices"

export type TtsStatus = "idle" | "playing" | "paused"

export type TtsSnapshot = {
  status: TtsStatus
  replyId: string | null
  chunkIndex: number
  chunkCount: number
  charIndex: number
  error: string | null
  supported: boolean
}

export type PlayRequest = {
  replyId: string
  chunks: string[]
  startIndex?: number
}

export const NO_VOICES_MESSAGE =
  "No system voices showed up. Install an English voice in your OS speech settings, then reload."

const idleSnapshot: TtsSnapshot = {
  status: "idle",
  replyId: null,
  chunkIndex: 0,
  chunkCount: 0,
  charIndex: 0,
  error: null,
  supported: true,
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null
  return window.speechSynthesis ?? null
}

export class TtsEngine {
  private listeners = new Set<() => void>()
  private snapshot: TtsSnapshot = idleSnapshot
  private chunks: string[] = []
  private generation = 0
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private remainder = ""
  private rate = 1
  private voiceURI: string | null = null

  constructor() {
    if (typeof window !== "undefined") {
      this.snapshot = {
        ...idleSnapshot,
        supported: "speechSynthesis" in window,
      }
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  getServerSnapshot = () => idleSnapshot

  setRate(rate: number) {
    this.rate = rate
    if (this.snapshot.status === "playing") {
      this.speakAt(this.snapshot.chunkIndex, true)
    }
  }

  setVoice(uri: string | null) {
    this.voiceURI = uri
    if (this.snapshot.status === "playing") {
      this.speakAt(this.snapshot.chunkIndex, true)
    }
  }

  play(request: PlayRequest) {
    const synth = getSynth()
    if (!synth) {
      this.replace({
        ...idleSnapshot,
        supported: false,
        error: "This browser has no speech engine. Use Chrome, Edge, or Safari.",
      })
      return
    }

    const chunks = request.chunks.filter((chunk) => chunk.trim().length > 0)
    if (chunks.length === 0) {
      this.replace({
        ...idleSnapshot,
        error: "Nothing speakable in that reply. Try turning code skipping off, or paste prose.",
      })
      return
    }

    this.chunks = chunks
    this.remainder = ""
    const my = ++this.generation
    void this.beginPlayback(request, chunks, my)
  }

  private async beginPlayback(
    request: PlayRequest,
    chunks: string[],
    my: number
  ) {
    const voices = await waitForVoices(600)
    if (my !== this.generation) return
    if (voices.length === 0) {
      this.chunks = []
      this.replace({
        ...idleSnapshot,
        supported: true,
        error: NO_VOICES_MESSAGE,
      })
      return
    }

    this.replace({
      status: "playing",
      replyId: request.replyId,
      chunkIndex: request.startIndex ?? 0,
      chunkCount: chunks.length,
      charIndex: 0,
      error: null,
      supported: true,
    })
    this.speakAt(this.snapshot.chunkIndex, false)
  }

  pause() {
    if (this.snapshot.status !== "playing") return
    this.generation += 1
    this.stopKeepAlive()
    getSynth()?.cancel()
    this.replace({ ...this.snapshot, status: "paused" })
  }

  resume() {
    if (this.snapshot.status !== "paused") return
    this.replace({ ...this.snapshot, status: "playing" })
    this.speakAt(this.snapshot.chunkIndex, true)
  }

  stop() {
    this.generation += 1
    this.chunks = []
    this.remainder = ""
    this.stopKeepAlive()
    getSynth()?.cancel()
    this.replace({ ...idleSnapshot, supported: this.snapshot.supported })
  }

  toggle(request: PlayRequest) {
    if (
      this.snapshot.replyId === request.replyId &&
      this.snapshot.status === "playing"
    ) {
      this.pause()
      return
    }
    if (
      this.snapshot.replyId === request.replyId &&
      this.snapshot.status === "paused"
    ) {
      this.resume()
      return
    }
    this.play(request)
  }

  next() {
    if (!this.snapshot.replyId) return
    const nextIndex = Math.min(
      this.snapshot.chunkIndex + 1,
      Math.max(this.chunks.length - 1, 0)
    )
    this.remainder = ""
    if (this.snapshot.status === "paused") {
      this.replace({ ...this.snapshot, chunkIndex: nextIndex, charIndex: 0 })
      return
    }
    this.replace({ ...this.snapshot, chunkIndex: nextIndex, charIndex: 0 })
    this.speakAt(nextIndex, false)
  }

  prev() {
    if (!this.snapshot.replyId) return
    const prevIndex = Math.max(this.snapshot.chunkIndex - 1, 0)
    this.remainder = ""
    if (this.snapshot.status === "paused") {
      this.replace({ ...this.snapshot, chunkIndex: prevIndex, charIndex: 0 })
      return
    }
    this.replace({ ...this.snapshot, chunkIndex: prevIndex, charIndex: 0 })
    this.speakAt(prevIndex, false)
  }

  private speakAt(index: number, useRemainder: boolean) {
    const synth = getSynth()
    if (!synth) return

    if (index >= this.chunks.length) {
      this.stop()
      return
    }

    this.generation += 1
    const my = this.generation
    synth.cancel()

    const full = this.chunks[index] ?? ""
    const text = useRemainder && this.remainder ? this.remainder : full
    this.remainder = text
    const offset = full.length - text.length

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = this.rate
    utterance.pitch = 1
    utterance.volume = 1
    const voice = findVoice(this.voiceURI)
    if (voice) utterance.voice = voice

    utterance.onboundary = (event) => {
      if (my !== this.generation) return
      if (typeof event.charIndex !== "number") return
      this.remainder = text.slice(event.charIndex)
      this.replace({
        ...this.snapshot,
        charIndex: offset + event.charIndex,
      })
    }

    utterance.onend = () => {
      if (my !== this.generation) return
      this.remainder = ""
      this.speakAt(index + 1, false)
      if (index + 1 < this.chunks.length) {
        this.replace({
          ...this.snapshot,
          chunkIndex: index + 1,
          charIndex: 0,
        })
      }
    }

    utterance.onerror = (event) => {
      if (my !== this.generation) return
      if (event.error === "interrupted" || event.error === "canceled") return
      this.generation += 1
      this.chunks = []
      this.remainder = ""
      this.stopKeepAlive()
      getSynth()?.cancel()
      this.replace({
        ...idleSnapshot,
        supported: this.snapshot.supported,
        error: humanizeSpeechError(event.error),
      })
    }

    this.replace({
      ...this.snapshot,
      status: "playing",
      chunkIndex: index,
      chunkCount: this.chunks.length,
      charIndex: offset,
      error: null,
    })
    this.startKeepAlive()
    window.setTimeout(() => {
      if (my !== this.generation) return
      getSynth()?.speak(utterance)
    }, 20)
  }

  private startKeepAlive() {
    this.stopKeepAlive()
    this.keepAlive = setInterval(() => {
      const synth = getSynth()
      if (!synth) return
      if (this.snapshot.status === "playing" && synth.speaking) {
        synth.resume()
      }
    }, 8000)
  }

  private stopKeepAlive() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive)
      this.keepAlive = null
    }
  }

  private replace(next: TtsSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}

function waitForVoices(timeoutMs: number): Promise<SpeechSynthesisVoice[]> {
  const synth = getSynth()
  if (!synth) return Promise.resolve([])
  const existing = synth.getVoices()
  if (existing.length > 0) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener("voiceschanged", finish)
      resolve(synth.getVoices())
    }
    synth.addEventListener("voiceschanged", finish)
    window.setTimeout(finish, timeoutMs)
  })
}

function humanizeSpeechError(error: string) {
  if (getSynth()?.getVoices().length === 0) {
    return NO_VOICES_MESSAGE
  }
  if (error === "not-allowed") {
    return "The browser blocked speech. Click play again after interacting with the page."
  }
  if (error === "synthesis-failed" || error === "synthesis-unavailable") {
    return "The speech engine failed. Try another voice, or reload the page."
  }
  if (error === "network") {
    return "A cloud voice needed the network and failed. Pick a local voice."
  }
  return `Speech stopped (${error}).`
}

export const tts = new TtsEngine()
