// Other running macOS apps, found through `lsappinfo` so Split needs no extra native code:
// Spectacle (the app Split replaced), other window apps with the same shortcuts, and System Settings.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Process ids of the running apps with this bundle id; empty when none or outside macOS. */
export async function runningPids(bundleId: string): Promise<number[]> {
  if (process.platform !== 'darwin') {
    return []
  }
  try {
    const { stdout } = await run('/usr/bin/lsappinfo', ['find', `bundleid=${bundleId}`])
    const pids: number[] = []
    // Why: each line is `ASN:0x0-0x1a01a-"System Settings":`; the name may hold spaces, so only the number part is kept.
    for (const asn of stdout.match(/ASN:0x[0-9a-f]+-0x[0-9a-f]+/gi) ?? []) {
      const info = await run('/usr/bin/lsappinfo', ['info', '-only', 'pid', asn])
      const pid = Number(/"pid"=(\d+)/.exec(info.stdout)?.[1])
      if (pid > 0) {
        pids.push(pid)
      }
    }
    return pids
  } catch {
    return []
  }
}

/** Where the running app with this bundle id is installed, or null when it is not running. */
export async function appPath(bundleId: string): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null
  }
  try {
    const { stdout } = await run('/usr/bin/lsappinfo', ['find', `bundleid=${bundleId}`])
    const asn = /ASN:0x[0-9a-f]+-0x[0-9a-f]+/i.exec(stdout)?.[0]
    if (!asn) {
      return null
    }
    const info = await run('/usr/bin/lsappinfo', ['info', '-only', 'bundlepath', asn])
    return /"LSBundlePath"="([^"]+)"/.exec(info.stdout)?.[1] ?? null
  } catch {
    return null
  }
}

/** Takes `name` out of the login items so it does not start again at the next login. */
export async function removeLoginItem(name: string): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }
  try {
    // Why: macOS asks once whether Split may control System Events; when refused, the item stays.
    await run('/usr/bin/osascript', [
      '-e',
      `tell application "System Events" to delete (every login item whose name is "${name}")`
    ])
  } catch {
    // Refused or not a login item.
  }
}

/** How long an app gets to quit before `reopenApp` gives up, and how often to look. */
const QUIT_WAIT_MS = 10_000
const QUIT_LOOK_MS = 300

/**
 * Quits the app with this bundle id and opens it again. Returns false when it was still running
 * after the wait (for example it asked to save a document), and then it is not opened again.
 */
export async function reopenApp(bundleId: string): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }
  // Why: SIGTERM is the same quit the app gets from logging out, so it closes its windows itself.
  for (const pid of await runningPids(bundleId)) {
    try {
      process.kill(pid)
    } catch {
      // Already gone.
    }
  }
  const until = Date.now() + QUIT_WAIT_MS
  while ((await runningPids(bundleId)).length > 0) {
    if (Date.now() > until) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, QUIT_LOOK_MS))
  }
  try {
    await run('/usr/bin/open', ['-b', bundleId])
    return true
  } catch {
    return false
  }
}
