"use client"

import { PauseIcon, PlayIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Block } from "@/lib/speakable"
import type { TtsStatus } from "@/lib/tts-engine"

type ReplyCardProps = {
  createdAt: number
  blocks: Block[]
  isActive: boolean
  status: TtsStatus
  chunkIndex: number
  supported: boolean
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onDelete: () => void
  onPlayFrom: (index: number) => void
}

export function ReplyCard({
  createdAt,
  blocks,
  isActive,
  status,
  chunkIndex,
  supported,
  onPlay,
  onPause,
  onResume,
  onDelete,
  onPlayFrom,
}: ReplyCardProps) {
  const playing = isActive && (status === "playing" || status === "loading")
  const paused = isActive && status === "paused"
  const time = new Date(createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <article
      className={cn(
        "rounded-2xl border bg-card/70 p-4 shadow-sm transition-colors sm:p-5",
        playing ? "border-amber-400/40" : "border-border/80"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Cursor reply · {time}</p>
        {status === "loading" && isActive ? (
          <Badge variant="secondary">Loading audio</Badge>
        ) : playing ? (
          <Badge className="bg-amber-400/15 text-amber-100">Speaking</Badge>
        ) : paused ? (
          <Badge variant="secondary">Paused</Badge>
        ) : null}
      </div>

      <div className="space-y-3 text-[15px] leading-7">
        {renderBlocks({
          blocks,
          activeIndex: isActive ? chunkIndex : -1,
          onPlayFrom,
        })}
      </div>

      <div className="mt-4 flex items-center gap-1">
        <Button
          type="button"
          variant={playing ? "default" : "outline"}
          size="sm"
          aria-label={
            status === "loading" && isActive
              ? "Cancel"
              : playing
                ? "Pause"
                : paused
                  ? "Resume"
                  : "Play reply"
          }
          disabled={!supported}
          onClick={() => {
            if (playing) onPause()
            else if (paused) onResume()
            else onPlay()
          }}
        >
          {playing ? (
            <PauseIcon data-icon="inline-start" />
          ) : (
            <PlayIcon data-icon="inline-start" />
          )}
          {playing ? "Pause" : paused ? "Resume" : "Play"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove reply"
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </article>
  )
}

function renderBlocks({
  blocks,
  activeIndex,
  onPlayFrom,
}: {
  blocks: Block[]
  activeIndex: number
  onPlayFrom: (index: number) => void
}) {
  let cursor = 0
  return blocks.map((block) => {
    if (block.kind === "code" && block.skipped) {
      return (
        <p
          key={block.id}
          className="rounded-lg bg-muted/70 px-3 py-2 font-mono text-xs text-muted-foreground"
        >
          {block.note}
        </p>
      )
    }

    const Tag = block.kind === "heading" ? "h3" : block.kind === "quote" ? "blockquote" : "p"
    const nodes = block.sentences.map((sentence) => {
      const index = cursor
      cursor += 1
      const active = index === activeIndex
      return (
        <button
          key={sentence.id}
          type="button"
          data-active-sentence={active ? "true" : "false"}
          onClick={() => onPlayFrom(index)}
          className={cn(
            "rounded-sm text-left transition-colors",
            active
              ? "bg-amber-400/20 text-foreground ring-1 ring-amber-400/30"
              : "hover:bg-muted/80"
          )}
        >
          {sentence.source}{" "}
        </button>
      )
    })

    return (
      <Tag
        key={block.id}
        className={cn(
          block.kind === "heading" && "font-heading text-base font-semibold",
          block.kind === "quote" &&
            "border-l-2 border-border pl-3 text-muted-foreground"
        )}
      >
        {nodes}
      </Tag>
    )
  })
}
