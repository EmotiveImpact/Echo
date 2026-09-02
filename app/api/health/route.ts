export const dynamic = "force-dynamic"

export function GET() {
  return Response.json(
    {
      app: "hearback",
      version: "0.1.7",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
