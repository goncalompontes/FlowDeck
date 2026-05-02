import type { CommandContext } from "../../types/command-context"
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync } from "fs"
import { join, relative, extname } from "path"
import { planningDir } from "../../tools/planning-state-lib"
import { loadTimestamps, saveTimestamps, checkFileChanged, getFileMetadata, type TimestampsData, type FileMetadata } from "../../lib/timestamps"
import { extractSignatures, detectConflicts, type ConflictReport } from "../../lib/signatures"
import { confirmPrompt } from "../../lib/confirmation"

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json"])

function discoverSourceFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (d: string) => {
    const entries = readdirSync(d, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(d, entry.name)
      if (entry.name === ".codebase" || entry.name === "node_modules" || entry.name === ".planning") continue
      if (entry.isDirectory()) {
        walk(full)
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name))) {
        files.push(relative(dir, full))
      }
    }
  }
  walk(dir)
  return files
}

function extractSignaturesFromFile(filePath: string): string[] {
  if (!existsSync(filePath)) return []
  const content = readFileSync(filePath, "utf-8")
  return extractSignatures(content)
}

export const mapCodebaseCommand = {
  name: "fd-map-codebase",
  description: "Parallel analysis agents → .codebase/ docs (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS). Use --incremental to process only changed files.",
  async execute(context: CommandContext, args?: { incremental?: boolean; yes?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const pd = planningDir(dir)
    const incremental = args?.incremental === true

    // Check if project is initialized
    const statePath = join(pd, "STATE.md")
    if (!existsSync(statePath)) {
      return {
        error: "STATE.md not found. Run /new-project first to initialize the project.",
        code: "NOT_INITIALIZED",
      }
    }

    // Incremental mode requires prior full rebuild
    if (incremental) {
      const timestamps = loadTimestamps(dir)
      if (!timestamps) {
        return {
          error: "Incremental mode requires prior run. Run `/map-codebase` without --incremental first.",
          code: "NO_TIMESTAMPS",
        }
      }
      return this.runIncremental(dir, timestamps)
    }

    // Full rebuild - existing behavior preserved
    return this.runFullRebuild(dir, args)
  },

  async runFullRebuild(dir: string, args?: { incremental?: boolean; yes?: boolean }) {
    const codebasePath = join(dir, ".codebase")

    // Warn if .codebase/ already exists (existing behavior)
    if (existsSync(codebasePath)) {
      // If --yes flag provided, skip confirmation and proceed
      if (!args?.yes) {
        return {
          ...confirmPrompt("map-codebase-overwrite", ".codebase/ already exists. Running /map-codebase will overwrite existing docs. Proceed? [y/n]"),
          code: "EXISTS",
          hint: "Use --yes to skip this confirmation",
        }
      }
    }

    // Discover all source files
    const sourceFiles = discoverSourceFiles(dir)

    // Build timestamps data
    const files: Record<string, FileMetadata> = {}
    const signatures: Record<string, string[]> = {}
    const now = new Date().toISOString()

    for (const relPath of sourceFiles) {
      const fullPath = join(dir, relPath)
      const meta = getFileMetadata(fullPath, dir)
      files[relPath] = meta
      signatures[relPath] = extractSignaturesFromFile(fullPath)
    }

    // Save timestamps BEFORE workflow (so incremental can use it)
    const timestampsData: TimestampsData = {
      version: "1.0",
      last_run: now,
      files,
      signatures,
    }
    saveTimestamps(dir, timestampsData)

    // Invoke map-codebase-flow.md workflow
    return {
      success: true,
      message: `Starting parallel codebase mapping.`,
      workflow: "map-codebase-flow.md",
      output_dir: ".codebase/",
      docs: ["STACK.md", "ARCHITECTURE.md", "STRUCTURE.md", "CONVENTIONS.md", "TESTING.md", "CONCERNS.md"],
      next_step: "Workflow will spawn 6 mapper agents in parallel",
      incremental_mode: false,
      files_processed: sourceFiles.length,
    }
  },

  async runIncremental(dir: string, timestamps: TimestampsData) {
    // Discover all source files
    const sourceFiles = discoverSourceFiles(dir)
    const toProcess: string[] = []
    const unchanged: string[] = []

    // Check each file for changes
    for (const relPath of sourceFiles) {
      const fullPath = join(dir, relPath)
      const storedMeta = timestamps.files[relPath]
      const result = checkFileChanged(fullPath, storedMeta, dir)

      if (result.changed) {
        toProcess.push(relPath)
      } else {
        unchanged.push(relPath)
      }
    }

    // Build new timestamps data for processed files
    const newFiles: Record<string, FileMetadata> = {}
    const newSignatures: Record<string, string[]> = {}
    const now = new Date().toISOString()

    for (const relPath of toProcess) {
      const fullPath = join(dir, relPath)
      const meta = getFileMetadata(fullPath, dir)
      newFiles[relPath] = meta
      newSignatures[relPath] = extractSignaturesFromFile(fullPath)
    }

    // Merge: keep unchanged files from old timestamps, add processed files
    const mergedFiles: Record<string, FileMetadata> = { ...timestamps.files }
    const mergedSignatures: Record<string, string[]> = { ...timestamps.signatures }

    for (const relPath of toProcess) {
      mergedFiles[relPath] = newFiles[relPath]
      mergedSignatures[relPath] = newSignatures[relPath]
    }

    // Detect signature conflicts (D-09, D-10, D-11)
    const conflictReport: ConflictReport = detectConflicts(timestamps.signatures, mergedSignatures)

    // Save updated timestamps
    const timestampsData: TimestampsData = {
      version: "1.0",
      last_run: now,
      files: mergedFiles,
      signatures: mergedSignatures,
    }
    saveTimestamps(dir, timestampsData)

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      message: `Incremental mapping complete.`,
      incremental_mode: true,
      files_processed: toProcess.length,
      files_unchanged: unchanged.length,
      workflow: "map-codebase-flow.md",
      output_dir: ".codebase/",
      next_step: "Workflow will spawn mapper agents for changed files",
    }

    // Add conflict warnings if any (D-11: do NOT block, just warn)
    if (conflictReport.conflicts.length > 0) {
      response.warning = `Cross-file reference conflicts detected in ${conflictReport.conflicts.length} file(s):\n` +
        conflictReport.conflicts.map(c =>
          `  - ${c.file}: ${c.oldCount} -> ${c.newCount} signatures (${c.affectedImports.length} changed)`
        ).join("\n")
      response.code = "SIGNATURE_CONFLICTS"
    }

    return response
  },
}
