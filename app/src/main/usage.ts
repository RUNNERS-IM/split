// Counts how often each window action is used, only for people who said yes in the consent sheet.
// The counting, saving and sending are runners-app-kit's (src/main/runners/usage-stats.ts).
import { join } from "node:path";
import { app } from "electron";
import { phoneAccessToken, USAGE_URL, USER_AGENT } from "./phone";
import { createUsageStats, type UsageStats } from "./runners/usage-stats";

const DAY_MS = 24 * 60 * 60 * 1000;

let stats: UsageStats | null = null;

export function usageStats(): UsageStats {
  stats ??= createUsageStats({
    version: app.getVersion(),
    filePath: join(app.getPath("userData"), "usage-stats.json"),
    token: phoneAccessToken,
    endpoint: USAGE_URL,
    userAgent: USER_AGENT,
  });
  return stats;
}

/** Why a daily send on top of the one at each connection: Split can stay open for weeks. */
export function startUsageStats(): void {
  setInterval(() => void usageStats().flush(), DAY_MS).unref();
  app.on("before-quit", () => usageStats().save());
}
