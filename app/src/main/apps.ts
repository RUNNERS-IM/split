// Other running macOS apps, found through `lsappinfo` so Split needs no extra native code:
// Spectacle (the app Split replaced), other window apps with the same shortcuts, and System Settings.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Process ids of the running apps with this bundle id; empty when none or outside macOS. */
export async function runningPids(bundleId: string): Promise<number[]> {
  if (process.platform !== "darwin") {return [];}
  try {
    const { stdout } = await run("/usr/bin/lsappinfo", ["find", `bundleid=${bundleId}`]);
    const pids: number[] = [];
    // Why: each line is `ASN:0x0-0x1a01a-"System Settings":`; the name may hold spaces, so only the number part is kept.
    for (const asn of stdout.match(/ASN:0x[0-9a-f]+-0x[0-9a-f]+/gi) ?? []) {
      const info = await run("/usr/bin/lsappinfo", ["info", "-only", "pid", asn]);
      const pid = Number(/"pid"=(\d+)/.exec(info.stdout)?.[1]);
      if (pid > 0) {pids.push(pid);}
    }
    return pids;
  } catch {
    return [];
  }
}

/** Takes `name` out of the login items so it does not start again at the next login. */
export async function removeLoginItem(name: string): Promise<void> {
  if (process.platform !== "darwin") {return;}
  try {
    // Why: macOS asks once whether Split may control System Events; when refused, the item stays.
    await run("/usr/bin/osascript", ["-e", `tell application "System Events" to delete (every login item whose name is "${name}")`]);
  } catch {
    // Refused or not a login item.
  }
}
