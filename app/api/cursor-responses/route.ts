import { readCursorResponses } from "@/lib/cursor-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const responses = await readCursorResponses()
    return Response.json(
      { responses },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    console.error("Could not read captured Cursor responses:", error)
    return Response.json(
      { error: "Hearback could not read Cursor responses." },
      { status: 500 }
    )
  }
}
