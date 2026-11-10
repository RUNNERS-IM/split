// Updates for the direct-download build (not the App Store one): check once a day, download in
// the background, then ask before installing, the same as every RUNNERS app.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, dialog, powerMonitor } from "electron";
import updater, { type UpdateInfo } from "electron-updater";
import type { UpdatePayload } from "../shared/types";
import { currentLanguage, t } from "./i18n.ts";
import { askToInstall, closeUpdateWindow, setUpdateProgress } from "./overlay.ts";

const { autoUpdater } = updater;
const DAY = 24 * 60 * 60 * 1000;
// Why: checking whether a day has passed is cheap, so a short tick catches up soon after a long sleep too.
const TICK = 60 * 60 * 1000;
/** After waking the network needs a moment before a check can reach GitHub. */
const AFTER_WAKE = 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let wired = false;
/** True while a check started from the menu, so "you're up to date" is only said when asked. */
let manual = false;
/** When the last check reached GitHub, so a check is not repeated within the day. */
let checkedAt = 0;
let autoCheck = false;
/** The window was closed while still downloading; it comes back once the download is done. */
let reopenWhenReady = false;
let downloaded = false;

function today(): string {
  return new Date().toDateString();
}

function laterFile(): string {
  return join(app.getPath("userData"), "UpdateLater.txt");
}

/** The day "Later" was chosen; the daily check stays quiet for the rest of that day, across restarts too. */
function postponedToday(): boolean {
  try {
    return readFileSync(laterFile(), "utf8").trim() === today();
  } catch {
    return false;
  }
}

function postpone(): void {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(laterFile(), `${today()}\n`);
  } catch {
    // Not remembering "Later" only means asking again after a restart.
  }
}

type Notes = string | { note: string | null }[] | null | undefined;

/**
 * The "What's new" lines for one language from the GitHub release text, which has a "## 한국어"
 * and a "## English" heading, each over a "- " list (see _docs/작업 가이드/공통.md).
 * GitHub hands the text over as HTML, so tags are turned back into lines first.
 * Anything that does not follow that shape gives no lines, and the window leaves the box out.
 */
export function releaseNotes(notes: Notes, language: "ko" | "en"): string[] {
  const raw = Array.isArray(notes) ? (notes[0]?.note ?? "") : (notes ?? "");
  const text = raw
    .replace(/<h\d[^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(h\d|li|p|ul)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  const heading = language === "ko" ? "한국어" : "english";
  const lines: string[] = [];
  let inside = false;
  for (const line of text.split("\n").map((value) => value.trim())) {
    if (line.startsWith("#")) {
      inside = line.replace(/^#+\s*/, "").toLowerCase() === heading;
    } else if (inside && line.startsWith("- ") && line.length > 2) {
      lines.push(line.slice(2).trim());
    }
  }
  return lines;
}

function payload(info: UpdateInfo, downloading: boolean): UpdatePayload {
  return {
    title: t("UpdateAvailableTitle"),
    body: t("UpdateAvailableBody", info.version.replace("+", ".")),
    changesTitle: t("UpdateChanges"),
    changes: releaseNotes(info.releaseNotes, currentLanguage().startsWith("ko") ? "ko" : "en"),
    install: t("UpdateInstall"),
    later: t("UpdateLater"),
    downloading,
    downloadingText: t("UpdateDownloading"),
    installingText: t("UpdateInstalling"),
  };
}

/** Waits for the window's answer: install, or remember "Later" for the rest of the day. */
async function ask(info: UpdateInfo, downloading: boolean, focus: boolean): Promise<void> {
  const install = await askToInstall(payload(info, downloading), focus);
  if (install === null) {return;}
  // Why silent and run after: Windows would otherwise walk through the installer's pages and not open Split again.
  if (install) {autoUpdater.quitAndInstall(true, true);}
  else if (!downloaded) {reopenWhenReady = true;}
  else {postpone();}
}

function wire(): void {
  if (wired) {return;}
  wired = true;
  powerMonitor.on("resume", () => setTimeout(checkIfDue, AFTER_WAKE));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  // Why: a check from the menu shows the window right away with a progress bar; the daily check
  // stays quiet until the download is done.
  autoUpdater.on("update-available", (info) => {
    downloaded = false;
    if (!manual) {return;}
    manual = false;
    void ask(info, true, true);
  });
  autoUpdater.on("download-progress", (progress) => setUpdateProgress(progress.percent));
  autoUpdater.on("update-downloaded", (info) => {
    downloaded = true;
    if (setUpdateProgress("ready")) {return;}
    if (reopenWhenReady) {
      reopenWhenReady = false;
      // Why no focus: the person closed the window and has moved on; a Return typed elsewhere must not land on it.
      void ask(info, false, false);
      return;
    }
    const asked = manual;
    manual = false;
    if (!asked && postponedToday()) {return;}
    void ask(info, false, asked);
  });
  autoUpdater.on("update-not-available", () => {
    if (manual) {void dialog.showMessageBox({ type: "info", message: t("UpdateNone"), detail: app.getVersion().replace("+", ".") });}
    manual = false;
  });
  autoUpdater.on("error", (error) => {
    // Why: a window still showing the progress bar would stay at that number forever.
    const wasDownloading = !downloaded && closeUpdateWindow();
    const closedByPerson = reopenWhenReady;
    reopenWhenReady = false;
    if (manual || wasDownloading || closedByPerson) {void dialog.showMessageBox({ type: "warning", message: t("UpdateFailed"), detail: String(error?.message ?? error) });}
    manual = false;
  });
}

function check(): void {
  void autoUpdater
    .checkForUpdates()
    .then(() => {
      checkedAt = Date.now();
    })
    .catch(() => {});
}

/** The daily check, when the last one that reached GitHub is a day old. */
function checkIfDue(): void {
  if (autoCheck && Date.now() - checkedAt >= DAY) {check();}
}

/** Turns the daily check on or off; also checks once right away when turned on. */
export function startUpdater(enabled: boolean): void {
  if (!app.isPackaged) {return;}
  wire();
  if (timer) {clearInterval(timer);}
  timer = null;
  autoCheck = enabled;
  if (!enabled) {return;}
  check();
  timer = setInterval(checkIfDue, TICK);
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {return;}
  wire();
  manual = true;
  check();
}
