export interface CommandContext {
  directory?: string
  sessionID?: string
  messageID?: string
  agent?: string
  worktree?: string
  abort?: AbortSignal
  timestamp?: string
}

export interface CommandArgs {
  json?: boolean
}