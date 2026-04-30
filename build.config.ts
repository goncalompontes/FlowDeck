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
    emitCJS: true,
    inlineDependencies: false,
  },
  externals: [
    "@opencode-ai/plugin",
    "@opencode-ai/sdk",
  ],
})