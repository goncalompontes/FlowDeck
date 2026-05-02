/**
 * File Watcher + File Edited Hooks
 * Tracks files modified during a session.
 * Used by the compaction hook to include recently edited files in context.
 *
 * Ported/adapted from ECC's file.watcher.updated and file.edited handlers.
 */

export type ChangeType = "added" | "modified" | "deleted"

export interface FileChange {
  path: string
  type: ChangeType
}

export class SessionFileTracker {
  private changes = new Map<string, FileChange>()

  record(path: string, type: ChangeType): void {
    this.changes.set(path, { path, type })
  }

  getChanges(): FileChange[] {
    return [...this.changes.values()]
  }

  getEditedPaths(): string[] {
    return [...this.changes.values()]
      .filter((c) => c.type !== "deleted")
      .map((c) => c.path)
  }

  clear(): void {
    this.changes.clear()
  }
}

// Singleton tracker — shared across hooks within a plugin instance
export function createFileTrackerHooks(tracker: SessionFileTracker) {
  const fileEdited = (event: { path: string }) => {
    tracker.record(event.path, "modified")
  }

  const fileWatcherUpdated = (event: { path: string; type: string }) => {
    let changeType: ChangeType = "modified"
    if (event.type === "create" || event.type === "add") changeType = "added"
    else if (event.type === "delete" || event.type === "remove") changeType = "deleted"
    tracker.record(event.path, changeType)
  }

  return { fileEdited, fileWatcherUpdated }
}
