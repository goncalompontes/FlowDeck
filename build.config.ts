import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
  entries: [
    "./src/index",
  ],
  outDir: "dist",
  declaration: "compatible",
  clean: true,
  failOnWarn: false,
  rollup: {
    emitCJS: false,
    inlineDependencies: false,
  },
  externals: [
    "@opencode-ai/plugin",
    "@opencode-ai/sdk",
  ],
  hooks: {
    "build:done"(ctx) {
      const { execSync } = require("child_process")
      const { existsSync } = require("fs")
      // Compile the dashboard server as a self-contained bun bundle
      execSync(
        "bun build src/dashboard/server.ts --outfile dist/dashboard/server.mjs --target bun --format esm",
        { stdio: "inherit" }
      )
      // Copy EJS views into dist so they are available at runtime
      execSync("cp -r src/dashboard/views dist/dashboard/views", { stdio: "inherit" })
    },
  },
})