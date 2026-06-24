/**
 * Idea-to-Workflow Tool Tests
 *
 * Covers:
 * - Tool is defined with description and args
 * - Tool accepts idea string arg
 * - Tool calls buildWorkflow and returns structured result
 * - Tool returns JSON error object when buildWorkflow throws
 */

import { describe, it, expect } from "vitest"
import { ideaToWorkflowTool } from "@/tools/idea-to-workflow"

const ctx = {
  directory: "/tmp/test",
  sessionID: "test",
  messageID: "test",
  agent: "test",
  worktree: "/tmp/test",
  abort: new AbortController().signal,
} as any

describe("ideaToWorkflowTool", () => {
  it("is defined with a description", () => {
    expect(ideaToWorkflowTool).toBeDefined()
    expect(ideaToWorkflowTool.description).toBeTruthy()
    expect(typeof ideaToWorkflowTool.description).toBe("string")
  })

  it("has args with 'idea' string property", () => {
    expect(ideaToWorkflowTool.args).toBeDefined()
    expect(ideaToWorkflowTool.args.idea).toBeDefined()
  })

  it("accepts 'idea' as a string arg", () => {
    expect(ideaToWorkflowTool.args).toHaveProperty("idea")
  })

  it("returns a structured IdeaWorkflowResult for valid input", async () => {
    const result = await ideaToWorkflowTool.execute(
      { idea: "Build a user login page" },
      ctx,
    )
    const parsed = typeof result === "string" ? JSON.parse(result) : result
    expect(parsed).toHaveProperty("idea", "Build a user login page")
    expect(parsed).toHaveProperty("decomposedTasks")
    expect(parsed).toHaveProperty("phases")
    expect(parsed).toHaveProperty("agentAssignments")
    expect(parsed).toHaveProperty("suggestedWorkflowClass")
  })

  it("returns JSON error object for invalid input (throws)", async () => {
    const result = await ideaToWorkflowTool.execute({ idea: "ab" }, ctx)
    const parsed = typeof result === "string" ? JSON.parse(result) : result
    expect(parsed).toHaveProperty("error", true)
    expect(parsed).toHaveProperty("message")
  })

  it("returns error for empty idea", async () => {
    const result = await ideaToWorkflowTool.execute({ idea: "" }, ctx)
    const parsed = typeof result === "string" ? JSON.parse(result) : result
    expect(parsed).toHaveProperty("error", true)
    expect(parsed.message).toBeTruthy()
  })
})
