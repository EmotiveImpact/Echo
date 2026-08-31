import { DEFAULT_VOICE } from "@/lib/neural-voices"

export type TtsStatus = "idle" | "loading" | "playing" | "paused"

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

const idleSnapshot: TtsSnapshot = {
  status: "idle",
  replyId: null,
  chunkIndex: 0,
  chunkCount: 0,
  charIndex: 0,
  error: null,
  supported: true,
}

const SILENCE =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"

export class TtsEngine {
  private listeners = new Set<() => void>()
  private snapshot: TtsSnapshot = idleSnapshot
  private chunks: string[] = []
  private generation = 0
  private rate = 1
  private voiceURI: string = DEFAULT_VOICE
  private audio: HTMLAudioElement | null = null
  private ctx: AudioContext | null = null
  private cache = new Map<string, string>()

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
    if (this.audio) this.audio.playbackRate = rate
  }

  setVoice(uri: string | null) {
    const next = uri || DEFAULT_VOICE
    if (next === this.voiceURI) return
    this.voiceURI = next
    this.clearCache()
    if (this.snapshot.status === "playing" || this.snapshot.status === "loading") {
      this.generation += 1
      void this.playIndex(this.snapshot.chunkIndex)
    }
  }

  play(request: PlayRequest) {
    this.prime()
    const chunks = request.chunks.filter((chunk) => chunk.trim().length > 0)
    if (chunks.length === 0) {
      this.replace({
        ...idleSnapshot,
        error: "Nothing speakable in that reply. Try turning code skipping off, or paste prose.",
      })
      return
    }

    this.chunks = chunks
    this.generation += 1
    this.replace({
      status: "loading",
      replyId: request.replyId,
      chunkIndex: request.startIndex ?? 0,
      chunkCount: chunks.length,
      charIndex: 0,
      error: null,
      supported: true,
    })
    void this.playIndex(this.snapshot.chunkIndex)
  }

  pause() {
    if (this.snapshot.status !== "playing" && this.snapshot.status !== "loading") return
    this.generation += 1
    this.audio?.pause()
    this.replace({ ...this.snapshot, status: "paused" })
  }

  resume() {
    if (this.snapshot.status !== "paused") return
    this.prime()
    this.generation += 1
    const my = this.generation
    const audio = this.audio
    const index = this.snapshot.chunkIndex
    if (audio?.src && audio.src !== SILENCE && audio.currentTime > 0 && !audio.ended) {
      audio.onended = () => {
        if (my !== this.generation) return
        this.generation += 1
        void this.playIndex(index + 1)
      }
      this.replace({ ...this.snapshot, status: "playing" })
      void audio.play().catch((error) => {
        if (my !== this.generation) return
        this.fail(error)
      })
      return
    }
    this.replace({ ...this.snapshot, status: "loading" })
    void this.playIndex(index)
  }

  stop() {
    this.generation += 1
    this.chunks = []
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute("src")
      this.audio.load()
    }
    this.replace({ ...idleSnapshot })
  }

  toggle(request: PlayRequest) {
    if (this.snapshot.replyId === request.replyId && this.snapshot.status === "playing") {
      this.pause()
      return
    }
    if (this.snapshot.replyId === request.replyId && this.snapshot.status === "paused") {
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
    this.generation += 1
    this.audio?.pause()
    void this.playIndex(nextIndex)
  }

  prev() {
    if (!this.snapshot.replyId) return
    const prevIndex = Math.max(this.snapshot.chunkIndex - 1, 0)
    this.generation += 1
    this.audio?.pause()
    void this.playIndex(prevIndex)
  }

  private prime() {
    if (typeof window === "undefined") return
    const audio = this.ensureAudio()
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor && !this.ctx) this.ctx = new Ctor()
      void this.ctx?.resume()
    } catch {
      // Some browsers expose HTMLAudioElement only.
    }
    if (!audio.src) {
      audio.src = SILENCE
      void audio.play().catch(() => undefined)
    }
  }

  private ensureAudio() {
    if (this.audio) return this.audio
    const audio = new Audio()
    audio.preload = "auto"
    this.audio = audio
    return audio
  }

  private async playIndex(index: number) {
    const my = this.generation
    if (index >= this.chunks.length) {
      this.stop()
      return
    }

    const text = this.chunks[index] ?? ""
    this.replace({
      ...this.snapshot,
      status: "loading",
      chunkIndex: index,
      chunkCount: this.chunks.length,
      charIndex: 0,
      error: null,
    })

    try {
      const url = await this.getUrl(text)
      if (my !== this.generation) return
      const audio = this.ensureAudio()
      audio.pause()
      audio.onended = null
      audio.onerror = null
      audio.src = url
      audio.playbackRate = this.rate
      audio.onended = () => {
        if (my !== this.generation) return
        this.generation += 1
        void this.playIndex(index + 1)
      }
      audio.onerror = () => {
        if (my !== this.generation) return
        this.fail(new Error("The audio element could not play that clip."))
      }
      this.replace({
        ...this.snapshot,
        status: "playing",
        chunkIndex: index,
        error: null,
      })
      await audio.play()
      if (my !== this.generation) return
      this.prefetch(index + 1)
    } catch (error) {
      if (my !== this.generation) return
      this.fail(error)
    }
  }

  private async getUrl(text: string) {
    const key = `${this.voiceURI}::${text}`
    const cached = this.cache.get(key)
    if (cached) return cached

    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: this.voiceURI }),
    })
    if (!response.ok) {
      let detail = "Could not synthesize audio."
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) detail = payload.error
      } catch {
        detail = `Speech request failed (${response.status}).`
      }
      throw new Error(detail)
    }
    const blob = await response.blob()
    if (blob.size < 64) throw new Error("The speech service returned empty audio.")
    const url = URL.createObjectURL(blob)
    if (this.cache.size > 40) {
      const first = this.cache.keys().next().value
      if (first) {
        const stale = this.cache.get(first)
        if (stale) URL.revokeObjectURL(stale)
        this.cache.delete(first)
      }
    }
    this.cache.set(key, url)
    return url
  }

  private prefetch(index: number) {
    const text = this.chunks[index]
    if (!text) return
    const key = `${this.voiceURI}::${text}`
    if (this.cache.has(key)) return
    void this.getUrl(text).catch(() => undefined)
  }

  private fail(error: unknown) {
    const message =
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "The browser blocked audio. Click play again."
        : error instanceof Error
          ? error.message
          : "Playback failed."
    this.generation += 1
    this.audio?.pause()
    this.replace({
      ...idleSnapshot,
      error: message,
    })
  }

  private clearCache() {
    for (const url of this.cache.values()) URL.revokeObjectURL(url)
    this.cache.clear()
  }

  private replace(next: TtsSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}

export const tts = new TtsEngine()
