export interface Phase {
  number: number
  name: string
  status: "complete" | "in_progress" | "pending"
  stepsComplete: number
  stepsPending: number
  dependsOn?: string
}

export interface DashboardData {
  project: string
  milestone: string
  milestone_name: string
  phases: Phase[]
  blockers: string[]
  progress: { total: number; completed: number; percent: number }
  currentPhase: number
}
