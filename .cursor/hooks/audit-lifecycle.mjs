#!/usr/bin/env node

import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname } from "node:path"

const AUDIT_FILE = `${homedir()}/.hearback/hook-audit.jsonl`

async function readStdin() {
  let input = ""
  for await (const chunk of process.stdin) input += chunk
  return input
}

try {
  const payload = JSON.parse(await readStdin())
  const event = {
    event: payload.hook_event_name ?? "unknown",
    createdAt: Date.now(),
    status: payload.status ?? null,
    generationId: payload.generation_id ?? null,
    hasText: typeof payload.text === "string" && payload.text.length > 0,
    transcriptPath: payload.transcript_path ?? null,
  }

  await mkdir(dirname(AUDIT_FILE), { recursive: true })
  await appendFile(AUDIT_FILE, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  process.stdout.write('{"continue":true}\n')
} catch (error) {
  console.error("Hearback hook audit failed:", error)
  process.stdout.write('{"continue":true}\n')
}
