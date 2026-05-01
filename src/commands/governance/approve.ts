import { existsSync } from "fs"
import { statePath, timestamp } from "../../tools/planning-state-lib"
import {
  getPendingApprovals,
  getRecentApprovals,
  resolveApproval,
} from "../../services/approval-manager"
import { appendEvent } from "../../services/telemetry"

export const approveCommand = {
  name: "fd-approve",
  description: "Manage approval requests — list pending approvals, approve or reject a request by ID",
  async execute(
    context,
    args?: { id?: string; reject?: boolean; list?: boolean; recent?: boolean; json?: boolean }
  ) {
    const dir = context.directory ?? process.cwd()

    if (!existsSync(statePath(dir))) {
      return {
        error: "STATE.md not found. Run /fd-new-project first.",
        code: "NOT_INITIALIZED",
      }
    }

    // List pending approvals (default behavior)
    if (!args?.id || args?.list) {
      const pending = getPendingApprovals(dir)
      const recent = args?.recent ? getRecentApprovals(dir, 10) : []

      if (args?.json) {
        return { success: true, data: { pending, recent }, meta: { formatted: "json", timestamp: timestamp() } }
      }

      if (pending.length === 0) {
        return {
          success: true,
          message: ["─".repeat(55), "  No pending approvals", "═".repeat(55)].join("\n"),
          pending: [],
          meta: { formatted: "table", timestamp: timestamp() },
        }
      }

      const lines = [
        "─".repeat(55),
        `  Pending Approvals (${pending.length})`,
        "─".repeat(55),
        ...pending.map((a, i) => [
          `  [${i + 1}] ID: ${a.id.slice(0, 8)}...`,
          `      trigger: ${a.trigger}`,
          `      reason:  ${a.reason}`,
          ...(a.file_path ? [`      file:    ${a.file_path}`] : []),
          `      risk:    ${a.risk_score}  |  requested: ${a.requested_at.slice(0, 16).replace("T", " ")}`,
        ]).flat(),
        "─".repeat(55),
        `  To approve: /fd-approve --id <full-id>`,
        `  To reject:  /fd-approve --id <full-id> --reject`,
        "═".repeat(55),
      ]

      return {
        success: true,
        message: lines.join("\n"),
        pending,
        meta: { formatted: "table", timestamp: timestamp() },
      }
    }

    // Resolve a specific approval
    const decision = args.reject ? "rejected" : "approved"
    const ok = resolveApproval(dir, args.id, decision)

    if (!ok) {
      return {
        success: false,
        error: `Approval request not found: ${args.id}`,
        hint: "Run /fd-approve to list pending approval IDs",
        code: "NOT_FOUND",
      }
    }

    // Emit telemetry
    appendEvent(dir, {
      session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
      run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
      event: "approval.resolve",
      status: decision === "approved" ? "approved" : "rejected",
      meta: { approval_id: args.id, decision },
    })

    const icon = decision === "approved" ? "✓" : "✗"
    const lines = [
      "─".repeat(55),
      `  ${icon} Approval ${decision}: ${args.id.slice(0, 8)}...`,
      decision === "approved"
        ? "  Operation will proceed on next attempt."
        : "  Operation has been blocked.",
      "═".repeat(55),
    ]

    return {
      success: true,
      message: lines.join("\n"),
      approval_id: args.id,
      decision,
      meta: { formatted: "table", timestamp: timestamp() },
    }
  },
}
