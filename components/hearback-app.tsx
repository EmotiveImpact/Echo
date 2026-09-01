"use client"

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import {
  AudioLinesIcon,
  CircleCheckIcon,
  Link2Icon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PasteComposer } from "@/components/paste-composer"
import { PlayerDock } from "@/components/player-dock"
import { ReplyCard } from "@/components/reply-card"
import { Badge } from "@/components/ui/badge"
import {
  getCursorResponseServerSnapshot,
  getCursorResponseSnapshot,
  subscribeCursorResponses,
} from "@/lib/cursor-response-store"
import {
  addReply,
  getHearbackServerSnapshot,
  getHearbackSnapshot,
  patchSettings,
  removeReply,
  subscribeHearback,
} from "@/lib/hearback-store"
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
  const cursor = useSyncExternalStore(
    subscribeCursorResponses,
    getCursorResponseSnapshot,
    getCursorResponseServerSnapshot
  )
  const { voices } = useVoices()
  const { replies: manualReplies, settings } = store
  const replies = useMemo(() => {
    const capturedIds = new Set(cursor.responses.map((reply) => reply.id))
    return [
      ...cursor.responses,
      ...manualReplies.filter((reply) => !capturedIds.has(reply.id)),
    ]
  }, [cursor.responses, manualReplies])
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
        addReply({ id, createdAt: Date.now(), text, source: "manual" })
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
    toast.error("Wait for a Cursor reply, or paste one manually.")
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
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-black">
              <AudioLinesIcon className="size-4" />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold tracking-tight">
                Hearback
              </p>
              <p className="text-xs text-muted-foreground">
                Cursor replies, ready to play
              </p>
            </div>
          </div>
          <ConnectionBadge status={cursor.status} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-3 py-3 pb-44 sm:px-4 sm:py-4">
        <details className="group rounded-xl border border-border/70 bg-card/40">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            <span>Paste manually</span>
            <span className="text-xs group-open:hidden">Fallback</span>
          </summary>
          <div className="border-t border-border/70 p-2">
            <PasteComposer onListen={(text) => listen(text)} />
          </div>
        </details>

        {cursor.status === "error" ? (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Response bridge disconnected</p>
              <p className="mt-1 text-muted-foreground">{cursor.error}</p>
            </div>
          </div>
        ) : null}

        {replies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
              <Link2Icon className="size-4" />
            </div>
            <h2 className="mt-4 font-heading text-lg font-semibold">
              Waiting for the next Agent reply
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              This project installs a real Cursor response hook. When an Agent
              message finishes, it appears here automatically—no copy and paste.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              You can keep chatting in Agent mode with this Browser tab open.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => {
              const doc = docs[reply.id]
              if (!doc) return null
              return (
                <ReplyCard
                  key={reply.id}
                  createdAt={reply.createdAt}
                  source={reply.source}
                  blocks={doc.blocks}
                  isActive={snapshot.replyId === reply.id}
                  status={snapshot.status}
                  chunkIndex={snapshot.chunkIndex}
                  supported={snapshot.supported}
                  onPlay={() => playReply(reply)}
                  onPause={() => tts.pause()}
                  onResume={() => tts.resume()}
                  onDelete={
                    reply.source === "cursor"
                      ? undefined
                      : () => {
                          if (snapshot.replyId === reply.id) tts.stop()
                          removeReply(reply.id)
                        }
                  }
                  onPlayFrom={(index) => playReply(reply, index)}
                />
              )
            })}
          </div>
        )}
      </main>

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

function ConnectionBadge({
  status,
}: {
  status: "connecting" | "ready" | "connected" | "error"
}) {
  if (status === "connecting") {
    return (
      <Badge variant="outline">
        <Loader2Icon className="animate-spin" />
        Connecting
      </Badge>
    )
  }

  if (status === "error") {
    return (
      <Badge variant="destructive">
        <TriangleAlertIcon />
        Disconnected
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    >
      <CircleCheckIcon />
      {status === "connected" ? "Cursor connected" : "Hook ready"}
    </Badge>
  )
}
