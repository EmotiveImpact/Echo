"use client"

import { useState } from "react"
import { KeyRoundIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  clearAzureSpeech,
  saveAzureSpeech,
} from "@/lib/desktop-store"

export function DesktopVoiceSettings({
  configured,
}: {
  configured: boolean
}) {
  const [key, setKey] = useState("")
  const [region, setRegion] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!key.trim() || !region.trim()) {
      toast.error("Enter your Azure Speech key and region.")
      return
    }
    setSaving(true)
    try {
      await saveAzureSpeech(key, region)
      setKey("")
      toast.success("Official Azure Speech is now active.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Azure Speech.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="group rounded-xl border border-border/70 bg-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-2">
          {configured ? (
            <ShieldCheckIcon className="size-4 text-emerald-400" />
          ) : (
            <KeyRoundIcon className="size-4" />
          )}
          Voice provider
        </span>
        <span className="text-xs">
          {configured ? "Official Azure" : "Edge preview fallback"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-border/70 p-3">
        {configured ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Azure credentials are encrypted with the operating system&apos;s
              secure storage.
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void clearAzureSpeech()}
            >
              <Trash2Icon data-icon="inline-start" />
              Remove
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs leading-5 text-muted-foreground">
              Add an Azure Speech S0 or F0 resource to use Aria through
              Microsoft&apos;s supported API. Until then, Hearback uses the
              unofficial Edge endpoint for testing.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <Input
                type="password"
                value={key}
                autoComplete="off"
                placeholder="Azure Speech key"
                aria-label="Azure Speech key"
                onChange={(event) => setKey(event.target.value)}
              />
              <Input
                value={region}
                autoComplete="off"
                placeholder="Region, e.g. eastus"
                aria-label="Azure Speech region"
                onChange={(event) => setRegion(event.target.value)}
              />
            </div>
            <Button type="button" size="sm" disabled={saving} onClick={save}>
              <ShieldCheckIcon data-icon="inline-start" />
              {saving ? "Saving…" : "Use official Azure"}
            </Button>
          </>
        )}
      </div>
    </details>
  )
}
