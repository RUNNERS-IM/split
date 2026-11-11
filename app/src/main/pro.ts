// Split Pro: what the paid features are, and the window that tells about them. Port of SplitPro.m.
//
// Buying, signing in and restoring are not open yet. Saving and restoring layouts stay free for
// good, as runners.im/split says. Opening closed apps with a layout is the one Pro feature
// (decision 2026-11-11, 2B): it carries the "Pro" mark and stays open to everyone until launch.
import { app, BrowserWindow, ipcMain } from 'electron'
import type { ProPayload } from '../shared/types'
import { t } from './i18n.ts'

const isMac = process.platform === 'darwin'
/** kSheetWidth in SplitPro.m. */
const SHEET_WIDTH = 400

let preloadPath = ''
let urlFor: (page: string) => string = (page) => page
let proWindow: BrowserWindow | null = null

/** Remembers where the preload script and pages are. Call once after `app` is ready. */
export function setupPro(preload: string, rendererUrl: (page: string) => string): void {
  preloadPath = preload
  urlFor = rendererUrl
}

/** Whether a Pro feature may be used. Always true until buying opens ("ProFreeUntilLaunch"). */
export function proUnlocked(): boolean {
  return true
}

/**
 * What a menu item for a Pro feature shows next to its title. Menus cannot draw the macOS pill,
 * so the word goes in the sublabel (beside the title on Windows, under it on macOS 14.4 and later).
 */
export function proSublabel(): string {
  return 'Pro'
}

function proPayload(): ProPayload {
  return {
    kind: 'pro',
    title: 'Split Pro',
    features: t('ProFeatures'),
    monthly: t('ProPriceMonthly'),
    yearly: t('ProPriceYearly'),
    comingSoon: t('ProComingSoon'),
    signIn: t('ProSignIn'),
    restore: t('ProRestore'),
    done: t('ProContinue'),
    note: t('ProFreeUntilLaunch')
  }
}

/**
 * Shows what Split Pro adds and what it costs. With `parent` it opens as a sheet on that window
 * (macOS) or a modal window over it; without, in a window of its own in the middle of the screen.
 * A second call while it is open only brings it forward.
 */
export function showProSheet(parent?: BrowserWindow | null): void {
  if (proWindow && !proWindow.isDestroyed()) {
    proWindow.show()
    proWindow.focus()
    return
  }
  if (isMac) {
    app.focus({ steal: true })
  }
  const sheet = parent && !parent.isDestroyed() ? parent : null
  const window = new BrowserWindow({
    width: SHEET_WIDTH,
    height: 420,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Split Pro',
    // Why: a modal child of a window is shown as a sheet on macOS, as SplitShowProSheet does.
    ...(sheet ? { parent: sheet, modal: true } : {}),
    ...(isMac && !sheet ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true }
  })
  proWindow = window
  window.on('closed', () => {
    if (proWindow === window) {
      proWindow = null
    }
  })
  window.webContents.once('did-finish-load', () => {
    const measure = 'Math.ceil(document.documentElement.scrollHeight)'
    void window.webContents
      .executeJavaScript(measure)
      .then((height: unknown) => {
        if (!window.isDestroyed() && typeof height === 'number' && height > 0) {
          window.setContentSize(SHEET_WIDTH, height)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (window.isDestroyed()) {
          return
        }
        if (!sheet) {
          window.center()
        }
        window.show()
        window.focus()
      })
  })
  void window.loadURL(
    `${urlFor('layout.html')}#${encodeURIComponent(JSON.stringify(proPayload()))}`
  )
}

// The Pro mark in a page was clicked: the sheet opens on that page's window.
ipcMain.handle('pro:show', (event) => showProSheet(BrowserWindow.fromWebContents(event.sender)))
