// Which apps of a saved layout have to be started, kept apart from layouts.ts so it can be tested without Electron.

/**
 * Apps with a window in the layout on a connected monitor but no window open now, each once.
 * `openNames` holds what the open windows are known by: bundle ids and app names, as a layout may have saved either.
 */
export function closedApps(
  saved: readonly { bundle: string; display: string }[],
  openNames: readonly string[],
  connected: readonly string[]
): string[] {
  const open = new Set(openNames)
  const closed = new Set<string>()
  for (const window of saved) {
    if (window.bundle && !open.has(window.bundle) && connected.includes(window.display)) {
      closed.add(window.bundle)
    }
  }
  return [...closed]
}
