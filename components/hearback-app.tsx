"use client"

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { AudioLinesIcon } from "lucide-react"
import { toast } from "sonner"

import { PasteComposer } from "@/components/paste-composer"
import { PlayerDock } from "@/components/player-dock"
import { ReplyCard } from "@/components/reply-card"
import { SidebarPanel } from "@/components/sidebar-panel"
import { Button } from "@/components/ui/button"
import {
  addReply,
  getHearbackServerSnapshot,
  getHearbackSnapshot,
  patchSettings,
  removeReply,
  subscribeHearback,
} from "@/lib/hearback-store"
import { SAMPLE_REPLY } from "@/lib/sample-reply"
import { buildSpeakable } from "@/lib/speakable"
import { tts } from "@/lib/tts-engine"
import { useTts } from "@/hooks/use-tts"
import { useVoices } from "@/hooks/use-voices"

export function HearbackApp() {
  const snapshot = useTts()
  const store = useSyncExternalStore(
    subscribeHearback,
    getHearbackSnapshot,
    getHearbackServerSnapshot
  )
  const { voices, ready: voicesReady } = useVoices()
  const { replies, settings } = store
  const snapshotRef = useRef(snapshot)
  const repliesRef = useRef(replies)

  useEffect(() => {
    snapshotRef.current = snapshot
    repliesRef.current = replies
  }, [replies, snapshot])

  const voiceURI =
    settings.voiceURI && voices.some((voice) => voice.uri === settings.voiceURI)
      ? settings.voiceURI
      : (voices.find((voice) => voice.english) ?? voices[0])?.uri ?? null

  useEffect(() => {
    tts.setRate(settings.rate)
  }, [settings.rate])

  useEffect(() => {
    tts.setVoice(voiceURI)
  }, [voiceURI])

  const docs = useMemo(() => {
    return Object.fromEntries(
      replies.map((reply) => [
        reply.id,
        buildSpeakable(reply.text, {
          skipCode: settings.skipCode,
          skipUrls: settings.skipUrls,
        }),
      ])
    )
  }, [replies, settings.skipCode, settings.skipUrls])

  const listen = useCallback(
    (text: string, startIndex = 0, existingId?: string) => {
      const id = existingId ?? crypto.randomUUID()
      if (!existingId) {
        addReply({ id, createdAt: Date.now(), text })
      }
      const doc = buildSpeakable(text, {
        skipCode: settings.skipCode,
        skipUrls: settings.skipUrls,
      })
      if (doc.chunks.length === 0) {
        toast.error("Nothing speakable in that reply.")
        return
      }
      tts.play({ replyId: id, chunks: doc.chunks, startIndex })
    },
    [settings.skipCode, settings.skipUrls]
  )

  const playReply = useCallback(
    (reply: { id: string; text: string }, startIndex = 0) => {
      listen(reply.text, startIndex, reply.id)
    },
    [listen]
  )

  const onDockPlayPause = useCallback(() => {
    const current = snapshotRef.current
    if (current.status === "playing") {
      tts.pause()
      return
    }
    if (current.status === "paused") {
      tts.resume()
      return
    }
    const active =
      repliesRef.current.find((reply) => reply.id === current.replyId) ??
      repliesRef.current[0]
    if (active) {
      playReply(active)
      return
    }
    toast.error("Paste a Cursor reply first.")
  }, [playReply])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable

      if (event.code === "Space" && !typing) {
        event.preventDefault()
        onDockPlayPause()
      }
      if (event.key === "ArrowRight" && !typing) {
        event.preventDefault()
        tts.next()
      }
      if (event.key === "ArrowLeft" && !typing) {
        event.preventDefault()
        tts.prev()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDockPlayPause])

  useEffect(() => {
    if (snapshot.status !== "playing") return
    const active = document.querySelector("[data-active-sentence='true']")
    if (!(active instanceof HTMLElement)) return
    const rect = active.getBoundingClientRect()
    const visible = rect.top > 96 && rect.bottom < window.innerHeight - 180
    if (!visible) {
      active.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [snapshot.chunkIndex, snapshot.replyId, snapshot.status])

  useEffect(() => {
    if (snapshot.error) toast.error(snapshot.error)
  }, [snapshot.error])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-400 text-black">
              <AudioLinesIcon className="size-4" />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold tracking-tight">
                Hearback
              </p>
              <p className="text-xs text-muted-foreground">
                Click play on a Cursor reply. Hear it instead of reading it.
              </p>
            </div>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Local browser voices · nothing leaves this machine
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 pb-44 lg:flex-row lg:px-6">
        <div className="lg:w-80 lg:shrink-0">
          <SidebarPanel />
        </div>

        <main className="min-w-0 flex-1 space-y-4">
          <PasteComposer
            onListen={(text) => listen(text)}
            disabled={!snapshot.supported}
          />

          {!snapshot.supported ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              This browser has no speech engine. Open Hearback in Chrome, Edge, or
              Safari to hear replies.
            </div>
          ) : null}

          {voicesReady && voices.length === 0 && snapshot.supported ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No system voices showed up. Install an English voice in your OS
              speech settings, then reload.
            </div>
          ) : null}

          {replies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <h2 className="font-heading text-lg font-semibold">
                Nothing to hear yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Copy an agent reply from Cursor and paste it above. Or play a
                sample that explains why the speaker icon is not inside Cursor
                chat.
              </p>
              <Button
                type="button"
                className="mt-5"
                variant="outline"
                onClick={() => listen(SAMPLE_REPLY)}
              >
                Play a sample reply
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {replies.map((reply) => {
                const doc = docs[reply.id]
                if (!doc) return null
                return (
                  <ReplyCard
                    key={reply.id}
                    createdAt={reply.createdAt}
                    blocks={doc.blocks}
                    isActive={snapshot.replyId === reply.id}
                    status={snapshot.status}
                    chunkIndex={snapshot.chunkIndex}
                    supported={snapshot.supported}
                    onPlay={() => playReply(reply)}
                    onPause={() => tts.pause()}
                    onResume={() => tts.resume()}
                    onDelete={() => {
                      if (snapshot.replyId === reply.id) tts.stop()
                      removeReply(reply.id)
                    }}
                    onPlayFrom={(index) => playReply(reply, index)}
                  />
                )
              })}
            </div>
          )}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40">
        <PlayerDock
          status={snapshot.status}
          chunkIndex={snapshot.chunkIndex}
          chunkCount={
            snapshot.replyId
              ? (docs[snapshot.replyId]?.chunks.length ?? snapshot.chunkCount)
              : 0
          }
          rate={settings.rate}
          voiceURI={voiceURI}
          voices={voices}
          voicesReady={voicesReady}
          skipCode={settings.skipCode}
          skipUrls={settings.skipUrls}
          supported={snapshot.supported}
          onPlayPause={onDockPlayPause}
          onStop={() => tts.stop()}
          onPrev={() => tts.prev()}
          onNext={() => tts.next()}
          onRate={(rate) => patchSettings({ rate })}
          onVoice={(uri) => patchSettings({ voiceURI: uri })}
          onSkipCode={(skipCode) => patchSettings({ skipCode })}
          onSkipUrls={(skipUrls) => patchSettings({ skipUrls })}
        />
      </div>
    </div>
  )
}
