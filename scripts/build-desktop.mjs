import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const desktop = path.join(root, "desktop")
const companion = path.join(desktop, "companion")
const dist = path.join(desktop, "dist")

await Promise.all([
  rm(companion, { recursive: true, force: true }),
  rm(dist, { recursive: true, force: true }),
])
await Promise.all([
  mkdir(companion, { recursive: true }),
  mkdir(dist, { recursive: true }),
  mkdir(path.join(root, "artifacts", "desktop"), { recursive: true }),
])

await cp(path.join(root, ".next", "standalone"), companion, {
  recursive: true,
  dereference: true,
})
await cp(
  path.join(root, ".next", "static"),
  path.join(companion, ".next", "static"),
  { recursive: true }
)

await Promise.all([
  build({
    entryPoints: [path.join(desktop, "src", "main.ts")],
    outfile: path.join(dist, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron", "@cursor/sdk"],
  }),
  build({
    entryPoints: [path.join(desktop, "src", "preload.ts")],
    outfile: path.join(dist, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  }),
])

console.log("Staged Hearback Desktop and its standalone companion.")
