/**
 * Ideator Agent Tests
 *
 * Covers:
 * - createIdeatorAgent() returns a valid AgentDefinition
 * - Agent name is 'ideator'
 * - Agent has a description
 * - Agent config has model and prompt
 * - Agent contract exists in agent-contract-registry.ts
 */

import { describe, it, expect } from "vitest"
import { createIdeatorAgent } from "@/agents/ideator"
import { getContract } from "@/services/agent-contract-registry"

describe("createIdeatorAgent", () => {
  it("returns a valid AgentDefinition", () => {
    const agent = createIdeatorAgent(undefined)
    expect(agent).toBeDefined()
    expect(agent.name).toBe("ideator")
    expect(agent.description).toBeTruthy()
    expect(agent.config).toBeDefined()
  })

  it("agent name is 'ideator'", () => {
    const agent = createIdeatorAgent(undefined)
    expect(agent.name).toBe("ideator")
  })

  it("has a non-empty description", () => {
    const agent = createIdeatorAgent(undefined)
    expect(agent.description).toBeTruthy()
    expect(agent.description!.length).toBeGreaterThan(0)
  })

  it("has config with model", () => {
    const agent = createIdeatorAgent("gpt-4")
    expect(agent.config.model).toBe("gpt-4")
  })

  it("has config with prompt", () => {
    const agent = createIdeatorAgent(undefined)
    expect(agent.config.prompt).toBeTruthy()
    expect(agent.config.prompt!.length).toBeGreaterThan(0)
  })

  it("config has temperature set", () => {
    const agent = createIdeatorAgent(undefined)
    expect(agent.config.temperature).toBe(0.3)
  })

  it("uses customPrompt when provided", () => {
    const agent = createIdeatorAgent(undefined, "Custom prompt content")
    expect(agent.config.prompt).toBe("Custom prompt content")
  })

  it("appends customAppendPrompt when provided without customPrompt", () => {
    const baseAgent = createIdeatorAgent(undefined)
    const appendAgent = createIdeatorAgent(undefined, undefined, "Appended instructions")
    expect(appendAgent.config.prompt).toBe(baseAgent.config.prompt + "\n\nAppended instructions")
  })
})

describe("ideator contract in agent-contract-registry", () => {
  it("exists in the registry", () => {
    const contract = getContract("ideator")
    expect(contract).not.toBeNull()
  })

  it("has agent name 'ideator'", () => {
    const contract = getContract("ideator")
    expect(contract!.agent).toBe("ideator")
  })

  it("has a defined role", () => {
    const contract = getContract("ideator")
    expect(contract!.role).toBeTruthy()
    expect(contract!.role.length).toBeGreaterThan(0)
  })

  it("has allowed task types", () => {
    const contract = getContract("ideator")
    expect(contract!.allowedTaskTypes.length).toBeGreaterThan(0)
    expect(contract!.allowedTaskTypes).toContain("idea-decomposition")
  })

  it("has required inputs", () => {
    const contract = getContract("ideator")
    expect(contract!.requiredInputs.length).toBeGreaterThan(0)
  })

  it("has expected output fields", () => {
    const contract = getContract("ideator")
    expect(contract!.expectedOutputFields).toContain("decomposedTasks")
    expect(contract!.expectedOutputFields).toContain("phases")
  })

  it("has defined forbidden actions", () => {
    const contract = getContract("ideator")
    expect(contract!.forbiddenActions.length).toBeGreaterThan(0)
  })

  it("has escalation conditions", () => {
    const contract = getContract("ideator")
    expect(contract!.escalationConditions.length).toBeGreaterThan(0)
  })

  it("has success criteria", () => {
    const contract = getContract("ideator")
    expect(contract!.successCriteria.length).toBeGreaterThan(0)
  })
})
