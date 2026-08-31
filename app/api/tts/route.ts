import { synthesizeMp3 } from "@/lib/synthesize"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Send JSON with text to speak." }, { status: 400 })
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const text = typeof record.text === "string" ? record.text : ""
  if (!text.trim()) {
    return Response.json({ error: "Paste some text to speak." }, { status: 400 })
  }

  try {
    const mp3 = await synthesizeMp3(text, record.voice)
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed."
    console.error("TTS failed:", error)
    return Response.json({ error: message }, { status: 502 })
  }
}
