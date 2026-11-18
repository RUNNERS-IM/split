// Updates for the direct-download build (not the App Store one), through runners-app-kit's createUpdates like the
// other RUNNERS apps: check once a day and download right away. With the settings switch on (the default) the new
// version installs once the Mac has had no input for 10 minutes or when Split quits, and the next launch says so once;
// with it off Split asks before installing (runners-wiki 2026-11-19, 1A 2A). The window is overlay.ts askUpdate.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, powerMonitor } from 'electron'
import updater from 'electron-updater'
import { currentLanguage, t } from './i18n.ts'
import { askUpdate } from './overlay.ts'
import { createUpdates, type UpdateSettings, type Updates } from './runners/updates.ts'

let updates: Updates | null = null

function stateFile(): string {
  return join(app.getPath('userData'), 'Update.json')
}

type UpdateState = Omit<UpdateSettings, 'autoUpdate'>

function readState(): UpdateState {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as UpdateState
  } catch {
    return {}
  }
}

function writeState(change: UpdateState): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...change }))
  } catch {
    // Not remembering only means checking or asking once more after a restart.
  }
}

/** Starts the daily check once at launch; `autoUpdate` is read again each time, so the switch needs no restart. */
export function startUpdater(autoUpdate: () => boolean): void {
  if (!app.isPackaged || updates) {
    return
  }
  updates = createUpdates({
    isPackaged: app.isPackaged,
    autoUpdater: updater.autoUpdater,
    onResume: (listener) => powerMonitor.on('resume', listener),
    readSettings: () => ({ ...readState(), autoUpdate: autoUpdate() }),
    // Why: the switch itself lives in Settings.json; only the check, "Later" and the downloaded version go here.
    writeSettings: (change) => {
      const { autoUpdate, ...state } = change
      void autoUpdate
      writeState(state)
    },
    locale: () => (currentLanguage().startsWith('ko') ? 'ko' : 'en'),
    // Why: the kit asks for update.latest / update.failed; Split already has these words as UpdateNone / UpdateFailed.
    t: (key, args) => {
      if (key === 'update.latest') {
        return t('UpdateNone')
      }
      if (key === 'update.failed') {
        return `${t('UpdateFailed')}\n${args?.error ?? ''}`
      }
      return t(key)
    },
    askUpdate,
    appVersion: () => app.getVersion(),
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    tell: (message) => {
      const [first, ...rest] = message.split('\n')
      return dialog.showMessageBox({
        type: 'info',
        message: first,
        detail: rest.join('\n') || app.getVersion()
      })
    }
  })
  updates.start()
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    return
  }
  updates?.checkNow()
}
