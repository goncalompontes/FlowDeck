/**
 * Approval Manager Service
 * Manages approval requests for high-risk operations.
 * Stores state in .codebase/APPROVALS.json.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"

export type ApprovalStatus = "pending" | "approved" | "rejected"

export interface ApprovalRequest {
  id: string
  run_id: string
  session_id: string
  requested_at: string
  resolved_at?: string
  status: ApprovalStatus
  trigger: string
  reason: string
  risk_score: number
  file_path?: string
  change_description?: string
}

export interface ApprovalsStore {
  requests: ApprovalRequest[]
}

const APPROVAL_TTL_MS = 30 * 60 * 1000 // 30 minutes

const SENSITIVE_PATTERNS = [
  /auth/i, /login/i, /password/i, /secret/i, /token/i, /jwt/i, /session/i, /oauth/i,
  /payment/i, /billing/i, /stripe/i, /credit/i,
  /migration/i, /migrate/i, /schema/i, /alembic/i,
  /infra/i, /terraform/i, /ansible/i, /k8s/i, /kubernetes/i, /docker/i,
  /\.env/i, /secrets\./i, /config\/prod/i, /production/i,
  /admin/i, /privilege/i, /sudo/i,
]

export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some(p => p.test(filePath))
}

export function isApprovalRequired(filePath: string, riskScore: number): boolean {
  return riskScore < 40 || isSensitivePath(filePath)
}

function approvalsPath(dir: string): string {
  return join(codebaseDir(dir), "APPROVALS.json")
}

function loadStore(dir: string): ApprovalsStore {
  const p = approvalsPath(dir)
  if (!existsSync(p)) return { requests: [] }
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as ApprovalsStore
  } catch {
    return { requests: [] }
  }
}

function saveStore(dir: string, store: ApprovalsStore): void {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  writeFileSync(approvalsPath(dir), JSON.stringify(store, null, 2), "utf-8")
}

export function requestApproval(
  dir: string,
  run_id: string,
  trigger: string,
  reason: string,
  options: { file_path?: string; risk_score?: number; change_description?: string; session_id?: string } = {}
): ApprovalRequest {
  const store = loadStore(dir)
  const req: ApprovalRequest = {
    id: randomUUID(),
    run_id,
    session_id: options.session_id ?? "session-0",
    requested_at: new Date().toISOString(),
    status: "pending",
    trigger,
    reason,
    risk_score: options.risk_score ?? 0,
    ...(options.file_path ? { file_path: options.file_path } : {}),
    ...(options.change_description ? { change_description: options.change_description } : {}),
  }
  store.requests.push(req)
  saveStore(dir, store)
  return req
}

export function resolveApproval(dir: string, approval_id: string, decision: "approved" | "rejected"): boolean {
  const store = loadStore(dir)
  const req = store.requests.find(r => r.id === approval_id)
  if (!req) return false
  req.status = decision
  req.resolved_at = new Date().toISOString()
  saveStore(dir, store)
  return true
}

export function checkApproval(dir: string, file_path: string, command: string): ApprovalRequest | null {
  const store = loadStore(dir)
  const now = Date.now()
  // Find a recent approved request for this file+command that hasn't expired
  return store.requests
    .filter(r =>
      r.status === "approved" &&
      r.resolved_at &&
      (r.file_path === file_path || r.trigger === command) &&
      now - new Date(r.resolved_at).getTime() < APPROVAL_TTL_MS
    )
    .sort((a, b) => b.resolved_at!.localeCompare(a.resolved_at!))
    .at(0) ?? null
}

export function getPendingApprovals(dir: string): ApprovalRequest[] {
  return loadStore(dir).requests.filter(r => r.status === "pending")
}

export function getRecentApprovals(dir: string, limit = 10): ApprovalRequest[] {
  const store = loadStore(dir)
  return store.requests.slice(-limit).reverse()
}
