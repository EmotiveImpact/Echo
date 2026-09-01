import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extension = path.join(root, "extension")
const companion = path.join(extension, "companion")
const dist = path.join(extension, "dist")
const assets = path.join(extension, "assets")

await Promise.all([
  rm(companion, { recursive: true, force: true }),
  rm(dist, { recursive: true, force: true }),
  rm(assets, { recursive: true, force: true }),
])

await Promise.all([
  mkdir(companion, { recursive: true }),
  mkdir(dist, { recursive: true }),
  mkdir(assets, { recursive: true }),
  mkdir(path.join(root, "artifacts"), { recursive: true }),
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
await cp(
  path.join(root, ".cursor", "hooks", "capture-response.mjs"),
  path.join(assets, "capture-response.mjs")
)

await build({
  entryPoints: [path.join(extension, "src", "extension.ts")],
  outfile: path.join(dist, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: false,
  minify: false,
})

console.log("Staged the Cursor extension and standalone Hearback companion.")
