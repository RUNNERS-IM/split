// Updates for the direct-download build (not the App Store one): check once a day, download in
// the background, then ask before installing, the same as every RUNNERS app.
// The window is runners-app-kit's (overlay.ts askUpdate); this check-and-download flow is still Split's own,
// as Draw's is, so "Later" and the settings switch keep working as before.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, powerMonitor } from 'electron'
import updater, { type UpdateInfo } from 'electron-updater'
import type { UpdateOffer } from '../shared/types'
import { currentLanguage, t } from './i18n.ts'
import { askUpdate, showUpdateWindow } from './overlay.ts'
import { releaseNoteLines } from './runners/release-notes.ts'
import type { UpdatePrompt } from './runners/updates.ts'

const { autoUpdater } = updater
const DAY = 24 * 60 * 60 * 1000
// Why: checking whether a day has passed is cheap, so a short tick catches up soon after a long sleep too.
const TICK = 60 * 60 * 1000
/** After waking the network needs a moment before a check can reach GitHub. */
const AFTER_WAKE = 60 * 1000
let timer: NodeJS.Timeout | null = null
let wired = false
/** True while a check started from the menu, so "you're up to date" is only said when asked. */
let manual = false
/** When the last check reached GitHub, so a check is not repeated within the day. */
let checkedAt = 0
let autoCheck = false
/** The window was closed while still downloading; it comes back once the download is done. */
let reopenWhenReady = false
let downloaded = false

function today(): string {
  return new Date().toDateString()
}

function laterFile(): string {
  return join(app.getPath('userData'), 'UpdateLater.txt')
}

/** The day "Later" was chosen; the daily check stays quiet for the rest of that day, across restarts too. */
function postponedToday(): boolean {
  try {
    return readFileSync(laterFile(), 'utf8').trim() === today()
  } catch {
    return false
  }
}

function postpone(): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(laterFile(), `${today()}\n`)
  } catch {
    // Not remembering "Later" only means asking again after a restart.
  }
}

/** The open update window; `dropped` once Split closed it itself, so its "Later" is not taken as an answer. */
let asking: { prompt: UpdatePrompt; dropped: boolean } | null = null

function offer(info: UpdateInfo, downloading: boolean): UpdateOffer {
  return {
    version: info.version.replace('+', '.'),
    notes: releaseNoteLines(info.releaseNotes, currentLanguage().startsWith('ko') ? 'ko' : 'en'),
    downloading,
    percent: downloading ? 0 : 100
  }
}

/** Waits for the window's answer: install, or remember "Later" for the rest of the day. */
async function ask(info: UpdateInfo, downloading: boolean, focus: boolean): Promise<void> {
  // Why: a window already asking only comes forward, so a second check never turns into a "Later".
  if (asking && showUpdateWindow(focus)) {
    return
  }
  const mine = { prompt: askUpdate(offer(info, downloading), focus), dropped: false }
  asking = mine
  const answer = await mine.prompt.answer
  if (asking === mine) {
    asking = null
  }
  if (mine.dropped) {
    return
  }
  // Why silent and run after: Windows would otherwise walk through the installer's pages and not open Split again.
  if (answer === 'install') {
    autoUpdater.quitAndInstall(true, true)
  } else if (!downloaded) {
    reopenWhenReady = true
  } else {
    postpone()
  }
}

/** Shows the download in the open window, or its buttons once done; false when no window is open. */
function setProgress(change: Partial<UpdateOffer>): boolean {
  if (!asking) {
    return false
  }
  asking.prompt.set(change)
  return true
}

/** Closes the update window with no answer, when the download it shows has failed; false when none is open. */
function closeUpdateWindow(): boolean {
  if (!asking) {
    return false
  }
  asking.dropped = true
  asking.prompt.close()
  asking = null
  return true
}

function wire(): void {
  if (wired) {
    return
  }
  wired = true
  powerMonitor.on('resume', () => setTimeout(checkIfDue, AFTER_WAKE))
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  // Why: a check from the menu shows the window right away with a progress bar; the daily check
  // stays quiet until the download is done.
  autoUpdater.on('update-available', (info) => {
    downloaded = false
    if (!manual) {
      return
    }
    manual = false
    void ask(info, true, true)
  })
  autoUpdater.on('download-progress', (progress) => setProgress({ percent: progress.percent }))
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    if (setProgress({ downloading: false, percent: 100 })) {
      return
    }
    if (reopenWhenReady) {
      reopenWhenReady = false
      // Why no focus: the person closed the window and has moved on; a Return typed elsewhere must not land on it.
      void ask(info, false, false)
      return
    }
    const asked = manual
    manual = false
    if (!asked && postponedToday()) {
      return
    }
    void ask(info, false, asked)
  })
  autoUpdater.on('update-not-available', () => {
    if (manual) {
      void dialog.showMessageBox({
        type: 'info',
        message: t('UpdateNone'),
        detail: app.getVersion().replace('+', '.')
      })
    }
    manual = false
  })
  autoUpdater.on('error', (error) => {
    // Why: a window still showing the progress bar would stay at that number forever.
    const wasDownloading = !downloaded && closeUpdateWindow()
    const closedByPerson = reopenWhenReady
    reopenWhenReady = false
    if (manual || wasDownloading || closedByPerson) {
      void dialog.showMessageBox({
        type: 'warning',
        message: t('UpdateFailed'),
        detail: String(error?.message ?? error)
      })
    }
    manual = false
  })
}

function check(): void {
  void autoUpdater
    .checkForUpdates()
    .then(() => {
      checkedAt = Date.now()
    })
    .catch(() => {})
}

/** The daily check, when the last one that reached GitHub is a day old. */
function checkIfDue(): void {
  if (autoCheck && Date.now() - checkedAt >= DAY) {
    check()
  }
}

/** Turns the daily check on or off; also checks once right away when turned on. */
export function startUpdater(enabled: boolean): void {
  if (!app.isPackaged) {
    return
  }
  wire()
  if (timer) {
    clearInterval(timer)
  }
  timer = null
  autoCheck = enabled
  if (!enabled) {
    return
  }
  check()
  timer = setInterval(checkIfDue, TICK)
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    return
  }
  wire()
  manual = true
  check()
}
