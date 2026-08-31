import type { ReactNode } from "react"
import { HeadphonesIcon, KeyboardIcon, LockIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function SidebarPanel() {
  return (
    <aside className="flex flex-col gap-6">
      <div>
        <Badge variant="outline" className="mb-3">
          Why this is beside Cursor
        </Badge>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          A play button on Cursor chat is a product feature, not an extension hook.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ChatGPT and Claude Code can speak a reply because they own the
          transcript UI. Cursor does not let third-party code inject controls
          into Agent bubbles. Hearback sits beside Cursor and plays real audio
          through the page — the browser speech API is too unreliable for this.
        </p>
      </div>

      <div className="space-y-3">
        <DifficultyRow
          icon={LockIcon}
          title="Inside Cursor chat"
          detail="Needs Cursor to ship a play control on assistant messages. There is no public chat contribution API."
          cost="Blocked"
        />
        <DifficultyRow
          icon={HeadphonesIcon}
          title="MCP speak tools"
          detail="Easy to wire, but the agent has to call a tool. You still do not get a play button on the text."
          cost="Easy, wrong UX"
        />
        <DifficultyRow
          icon={KeyboardIcon}
          title="This companion"
          detail="Paste any reply, click play, hear it. Audio is synthesized and played in the page, like ChatGPT's play button."
          cost="Shipped"
        />
      </div>

      <Separator />

      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Shortcuts
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Play or pause</span>
            <Kbd>Space</Kbd>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Listen to paste</span>
            <span className="flex gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Skip sentence</span>
            <span className="flex gap-1">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
            </span>
          </li>
        </ul>
      </div>
    </aside>
  )
}

function DifficultyRow({
  icon: Icon,
  title,
  detail,
  cost,
}: {
  icon: typeof LockIcon
  title: string
  detail: string
  cost: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/50 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{title}</p>
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {cost}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  )
}
