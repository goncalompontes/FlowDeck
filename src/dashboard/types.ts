export interface Phase {
  number: number
  name: string
  status: "complete" | "in_progress" | "pending"
  stepsComplete: number
  stepsPending: number
  dependsOn?: string
}

export interface TelemetrySummary {
  command: string
  total_runs: number
  successes: number
  failures: number
  avg_duration_ms: number
  last_run: string
}

export interface RecentRun {
  run_id: string
  command: string
  started_at: string
  ended_at?: string
  status: string
  risk_score: number
  files_touched: number
  outcome?: string
}

export interface PendingApproval {
  id: string
  trigger: string
  reason: string
  risk_score: number
  file_path?: string
  requested_at: string
}

export interface AgentPerfSummary {
  agent: string
  model: string
  task_type: string
  success_rate: number
  runs: number
  avg_duration_ms: number
}

export interface TDDDashboardState {
  stage: string
  cycle: number
  failing_tests: number
  passing_tests: number
  behaviors_completed: number
  behaviors_pending: number
  bugs_missing_regression: number
  overrides_used: number
}

export interface DashboardData {
  project: string
  milestone: string
  milestone_name: string
  phases: Phase[]
  blockers: string[]
  progress: { total: number; completed: number; percent: number }
  currentPhase: number
  // Operational telemetry
  telemetrySummary: TelemetrySummary[]
  recentRuns: RecentRun[]
  pendingApprovals: PendingApproval[]
  agentPerf: AgentPerfSummary[]
  toolFailureCount: number
  // TDD state
  tdd?: TDDDashboardState
}
