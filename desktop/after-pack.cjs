const { chmodSync, copyFileSync } = require("node:fs")
const path = require("node:path")

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return

  const src = path.join(
    context.packager.projectDir,
    "..",
    "scripts",
    "open-hearback.command"
  )
  const dest = path.join(context.appOutDir, "Open Hearback.command")
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}
