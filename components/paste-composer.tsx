"use client"

import { useRef, useState } from "react"
import { ClipboardPasteIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type PasteComposerProps = {
  onListen: (text: string) => void
  disabled?: boolean
}

export function PasteComposer({ onListen, disabled }: PasteComposerProps) {
  const [value, setValue] = useState("")
  const areaRef = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const text = value.trim()
    if (!text) {
      toast.error("Paste a Cursor reply first.")
      return
    }
    onListen(text)
    setValue("")
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error("Clipboard is empty.")
        return
      }
      setValue(text)
      areaRef.current?.focus()
    } catch {
      toast.error("Clipboard is blocked. Paste with Ctrl+V or Cmd+V instead.")
      areaRef.current?.focus()
    }
  }

  return (
    <div className="rounded-xl bg-card/80 p-2">
      <label htmlFor="reply" className="sr-only">
        Cursor reply to read aloud
      </label>
      <Textarea
        id="reply"
        ref={areaRef}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="Paste the Cursor reply you do not want to read…"
        className="min-h-24 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="px-2 text-xs text-muted-foreground">
          Manual fallback. Code fences are skipped while speaking.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={pasteClipboard}
            disabled={disabled}
          >
            <ClipboardPasteIcon data-icon="inline-start" />
            Clipboard
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={disabled}>
            <PlayIcon data-icon="inline-start" />
            Listen
          </Button>
        </div>
      </div>
    </div>
  )
}
