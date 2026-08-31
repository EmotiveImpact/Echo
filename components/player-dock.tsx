"use client"

import {
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import type { VoiceOption } from "@/lib/voices"
import { cn } from "@/lib/utils"

const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2]

type PlayerDockProps = {
  status: "idle" | "loading" | "playing" | "paused"
  chunkIndex: number
  chunkCount: number
  rate: number
  voiceURI: string | null
  voices: VoiceOption[]
  skipCode: boolean
  skipUrls: boolean
  supported: boolean
  onPlayPause: () => void
  onStop: () => void
  onPrev: () => void
  onNext: () => void
  onRate: (rate: number) => void
  onVoice: (uri: string) => void
  onSkipCode: (value: boolean) => void
  onSkipUrls: (value: boolean) => void
}

export function PlayerDock({
  status,
  chunkIndex,
  chunkCount,
  rate,
  voiceURI,
  voices,
  skipCode,
  skipUrls,
  supported,
  onPlayPause,
  onStop,
  onPrev,
  onNext,
  onRate,
  onVoice,
  onSkipCode,
  onSkipUrls,
}: PlayerDockProps) {
  const progress =
    chunkCount === 0 ? 0 : Math.min(100, ((chunkIndex + (status === "idle" ? 0 : 1)) / chunkCount) * 100)
  const english = voices.filter((voice) => voice.english)
  const other = voices.filter((voice) => !voice.english)
  const idle = status === "idle"

  return (
    <div className="border-t border-border/80 bg-background/90 backdrop-blur-md">
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-amber-400 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous sentence"
              disabled={idle || !supported}
              onClick={onPrev}
            >
              <SkipBackIcon />
            </Button>
            <Button
              type="button"
              size="icon-lg"
              aria-label={status === "playing" ? "Pause" : "Play"}
              disabled={!supported}
              onClick={onPlayPause}
              className={cn(status === "playing" && "bg-amber-400 text-black hover:bg-amber-300")}
            >
              {status === "loading" ? (
                <Loader2Icon className="animate-spin" />
              ) : status === "playing" ? (
                <PauseIcon />
              ) : (
                <PlayIcon />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next sentence"
              disabled={idle || !supported}
              onClick={onNext}
            >
              <SkipForwardIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Stop"
              disabled={idle}
              onClick={onStop}
            >
              <SquareIcon />
            </Button>
            <p className="ml-2 text-sm text-muted-foreground" aria-live="polite">
              {chunkCount === 0
                ? "Paste a reply to listen"
                : status === "loading"
                  ? `Loading sentence ${Math.min(chunkIndex + 1, chunkCount)} of ${chunkCount}`
                  : `Sentence ${Math.min(chunkIndex + 1, chunkCount)} of ${chunkCount}`}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="w-10 text-xs tabular-nums text-muted-foreground">
                {rate.toFixed(2).replace(/0$/, "")}×
              </span>
              <Slider
                className="w-32"
                min={0.8}
                max={2}
                step={0.05}
                value={[rate]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value
                  if (typeof next === "number") onRate(next)
                }}
              />
              <div className="hidden items-center gap-1 md:flex">
                {RATES.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="xs"
                    variant={almost(rate, option) ? "secondary" : "ghost"}
                    onClick={() => onRate(option)}
                  >
                    {option}×
                  </Button>
                ))}
              </div>
            </div>

            <Select
              value={voiceURI ?? null}
              onValueChange={(value) => {
                if (typeof value === "string") onVoice(value)
              }}
              disabled={voices.length === 0}
              items={Object.fromEntries(voices.map((voice) => [voice.uri, voice.name]))}
            >
              <SelectTrigger size="sm" className="w-full sm:w-56">
                <SelectValue placeholder="Choose a voice" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end" className="max-h-72">
                {english.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>English</SelectLabel>
                    {english.map((voice) => (
                      <SelectItem key={voice.uri} value={voice.uri}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {other.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Other languages</SelectLabel>
                    {other.map((voice) => (
                      <SelectItem key={voice.uri} value={voice.uri}>
                        {voice.name} · {voice.lang}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Switch
              checked={skipCode}
              onCheckedChange={(checked) => onSkipCode(Boolean(checked))}
              size="sm"
            />
            <span className="text-muted-foreground">Skip code fences</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={skipUrls}
              onCheckedChange={(checked) => onSkipUrls(Boolean(checked))}
              size="sm"
            />
            <span className="text-muted-foreground">Skip URLs</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function almost(value: number, target: number) {
  return Math.abs(value - target) < 0.03
}
