#!/usr/bin/env node

import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const EVENT_FILE =
  process.env.HEARBACK_RESPONSE_FILE ?? "/tmp/hearback-responses.jsonl"

async function readStdin() {
  let input = ""
  for await (const chunk of process.stdin) input += chunk
  return input
}

try {
  const payload = JSON.parse(await readStdin())
  const text = typeof payload.text === "string" ? payload.text.trim() : ""

  if (text) {
    const event = {
      id: `cursor:${payload.generation_id ?? crypto.randomUUID()}`,
      generationId: payload.generation_id ?? null,
      conversationId: payload.conversation_id ?? null,
      createdAt: Date.now(),
      source: "cursor",
      text,
    }

    await mkdir(dirname(EVENT_FILE), { recursive: true })
    await appendFile(EVENT_FILE, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
  }

  process.stdout.write('{"continue":true}\n')
} catch (error) {
  console.error("Hearback could not capture the Agent response:", error)
  process.stdout.write('{"continue":true}\n')
}
