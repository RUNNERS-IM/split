// Main-process side of the three small Split windows that are not Settings:
// - the move feedback overlay (glow, label, menu preview), one see-through window over one screen,
// - the shortcut list card shown while ⌥⌘ is held,
// - the update window (runners-app-kit's RunnersUpdate).
// The pages live in src/renderer/{overlay,sheet,update}; this file only places, shows and hides them.
import { app, BrowserWindow, ipcMain, screen, type Display } from 'electron'
import type { OverlayPayload, SheetPayload, UpdatePageText } from '../shared/types'
import { durationMs, overlayLifetime, type OverlayMessage } from '../renderer/overlay/metrics'
import { currentLanguage, rightToLeft, t } from './i18n.ts'
import { createUpdateWindow } from './runners/update-window.ts'

export { durationMs }

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

/** A feedback request in global screen coordinates (top-left based points, as Electron's `screen` uses). */
export type FeedbackRequest = Omit<OverlayPayload, 'rects'> & { rects: Rect[] }

const isMac = process.platform === 'darwin'

let preloadPath = ''
let urlFor: (page: string) => string = (page) => page

let overlayWindow: BrowserWindow | null = null
let overlayLoaded: Promise<void> = Promise.resolve()
let overlayHideTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on every show or hide, so a late timer or load never undoes a newer request. */
let overlayGeneration = 0

let sheetWindow: BrowserWindow | null = null
let sheetLoaded: Promise<void> = Promise.resolve()
let sheetFade: ReturnType<typeof setInterval> | null = null
let sheetGeneration = 0

/** A see-through, click-through window that floats over everything, on every Space, and never takes focus. */
function makeFloatingWindow(page: string): { window: BrowserWindow; loaded: Promise<void> } {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    // An NSPanel on macOS, so showing it never activates Split.
    ...(isMac ? { type: 'panel' } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      // Hidden between shows; it must still take messages and run its fade at full speed.
      backgroundThrottling: false
    }
  })
  window.setIgnoreMouseEvents(true)
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })
  const loaded = new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
  })
  void window.loadURL(urlFor(page))
  return { window, loaded }
}

/**
 * Remembers where the preload script and pages are and builds the overlay window ahead of time,
 * so the first move label shows without a load delay. Call once after `app` is ready.
 */
export function createOverlay(preload: string, rendererUrl: (page: string) => string): void {
  preloadPath = preload
  urlFor = rendererUrl
  ensureOverlayWindow()
}

function ensureOverlayWindow(): BrowserWindow {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    const made = makeFloatingWindow('overlay.html')
    overlayWindow = made.window
    overlayLoaded = made.loaded
    overlayWindow.on('closed', () => {
      overlayWindow = null
    })
  }
  return overlayWindow
}

function unionOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rect of rects) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The screen the rects are mostly on, or the one under the pointer when there are none. */
function displayFor(rects: Rect[]): Display {
  const union = unionOf(rects)
  if (union && union.width > 0 && union.height > 0) {
    return screen.getDisplayMatching({
      x: Math.round(union.x),
      y: Math.round(union.y),
      width: Math.round(union.width),
      height: Math.round(union.height)
    })
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

/**
 * The native module gives physical pixels on Windows and Linux, while Electron places windows in
 * DIPs (pixels divided by the display scale). macOS gives points, which already are DIPs.
 */
function toDip(rect: Rect): Rect {
  if (isMac) {
    return rect
  }
  if (process.platform === 'win32') {
    return screen.screenToDipRect(null, rect)
  }
  // Why: Electron on Linux uses one scale for every monitor, the primary display's.
  const scale = screen.getPrimaryDisplay().scaleFactor
  return {
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale
  }
}

/** The other way: an Electron rect (a window's bounds, a display's work area) in native coordinates. */
export function fromDip(rect: Rect): Rect {
  if (isMac) {
    return rect
  }
  if (process.platform === 'win32') {
    return screen.dipToScreenRect(null, rect)
  }
  const scale = screen.getPrimaryDisplay().scaleFactor
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  }
}

function relativeTo(rect: Rect, origin: Rect): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
}

function clearOverlayTimer(): void {
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer)
    overlayHideTimer = null
  }
}

/**
 * Shows the glow and label after a move ("frame"), only the label ("label"), or the outline of
 * where a window would go while a tray menu row is hovered ("preview", stays until hideFeedback).
 * `duration` is the macOS DurationScale() in ms (600 / 1000 / 1600); 0 or less is filled in from
 * `feedback.duration` (see durationMs).
 * The window hides itself once the fade-out is over.
 */
export function showFeedback(request: FeedbackRequest): void {
  if (request.kind !== 'preview' && request.feedback.style === 'off') {
    return
  }
  if (request.kind === 'preview' && request.rects.length === 0) {
    hideFeedback()
    return
  }
  const window = ensureOverlayWindow()
  const rects = request.rects.map(toDip)
  const display = displayFor(rects)
  const bounds = display.bounds
  const message: OverlayMessage = {
    ...request,
    duration: request.duration > 0 ? request.duration : durationMs(request.feedback.duration),
    rects: rects.map((rect) => relativeTo(rect, bounds)),
    area: relativeTo(display.workArea, bounds)
  }
  const generation = ++overlayGeneration
  clearOverlayTimer()

  void overlayLoaded.then(() => {
    if (generation !== overlayGeneration || window.isDestroyed()) {
      return
    }
    const current = window.getBounds()
    if (
      current.x !== bounds.x ||
      current.y !== bounds.y ||
      current.width !== bounds.width ||
      current.height !== bounds.height
    ) {
      window.setBounds(bounds)
    }
    window.webContents.send('overlay:show', message)
    if (!window.isVisible()) {
      window.showInactive()
    }
    // Some window managers drop the level while the window is hidden.
    window.setAlwaysOnTop(true, 'screen-saver')

    const lifetime = overlayLifetime(message)
    if (lifetime !== null) {
      overlayHideTimer = setTimeout(() => {
        overlayHideTimer = null
        if (generation === overlayGeneration && !window.isDestroyed()) {
          window.hide()
        }
      }, lifetime + 50)
    }
  })
}

/** Removes whatever the overlay shows right away (a preview when the menu closes, for example). */
export function hideFeedback(): void {
  overlayGeneration++
  clearOverlayTimer()
  const window = overlayWindow
  if (!window || window.isDestroyed()) {
    return
  }
  window.webContents.send('overlay:show', null)
  if (window.isVisible()) {
    window.hide()
  }
}

function ensureSheetWindow(): BrowserWindow {
  if (!sheetWindow || sheetWindow.isDestroyed()) {
    const made = makeFloatingWindow('sheet.html')
    sheetWindow = made.window
    sheetLoaded = made.loaded
    sheetWindow.on('closed', () => {
      sheetWindow = null
    })
  }
  return sheetWindow
}

function stopSheetFade(): void {
  if (sheetFade) {
    clearInterval(sheetFade)
    sheetFade = null
  }
}

/**
 * Shows the shortcut list in the middle of the screen under the pointer. The card is built from
 * `payload` each time, so changed shortcuts show up. It ignores the mouse; call hideSheet when
 * ⌥⌘ is released or another key or click comes.
 */
export function showSheet(payload: SheetPayload): void {
  const window = ensureSheetWindow()
  const generation = ++sheetGeneration
  stopSheetFade()
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  void sheetLoaded.then(() => {
    if (generation !== sheetGeneration || window.isDestroyed()) {
      return
    }
    window.setBounds(area)
    window.setOpacity(1)
    window.webContents.send('sheet:show', payload)
    // One frame for the page to swap in the new card before the window appears.
    setTimeout(() => {
      if (generation !== sheetGeneration || window.isDestroyed()) {
        return
      }
      if (!window.isVisible()) {
        window.showInactive()
      }
      window.setAlwaysOnTop(true, 'screen-saver')
    }, 16)
  })
}

/** Fades the shortcut list out over 0.12 s, then hides it. */
export function hideSheet(): void {
  const generation = ++sheetGeneration
  stopSheetFade()
  const window = sheetWindow
  if (!window || window.isDestroyed() || !window.isVisible()) {
    return
  }
  const steps = 6
  let step = 0
  sheetFade = setInterval(() => {
    if (generation !== sheetGeneration || window.isDestroyed()) {
      stopSheetFade()
      return
    }
    step++
    window.setOpacity(Math.max(0, 1 - step / steps))
    if (step >= steps) {
      stopSheetFade()
      window.hide()
      window.setOpacity(1)
    }
  }, 120 / steps)
}

const UPDATE_WIDTH = 400
/** The words RunnersUpdate asks for (runners-update.tsx); the page fills {{version}} and {{percent}} itself. */
const UPDATE_TEXT_KEYS = [
  'update.title',
  'update.ask',
  'update.notes',
  'update.later',
  'update.install',
  'update.installing',
  'update.downloading'
]
let updateWindow: BrowserWindow | null = null

/**
 * The "new version" window: runners-app-kit's createUpdateWindow (answers, the 1 s guard, closing is Later) around a
 * Split window that shows RunnersUpdate. The page gets its words in the URL hash and its state over `update:offer`.
 */
const updates = createUpdateWindow({
  channel: 'update:offerChanged',
  focusApp: () => {
    if (isMac) {
      app.focus({ steal: true })
    }
  },
  create: () => {
    const window = new BrowserWindow({
      width: UPDATE_WIDTH,
      height: 270,
      useContentSize: true,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: t('update.title'),
      ...(isMac ? { titleBarStyle: 'hidden' as const } : {}),
      webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true }
    })
    updateWindow = window
    window.on('closed', () => {
      if (updateWindow === window) {
        updateWindow = null
      }
    })
    const page: UpdatePageText = {
      lang: currentLanguage(),
      rtl: rightToLeft(),
      text: Object.fromEntries(UPDATE_TEXT_KEYS.map((key) => [key, t(key)]))
    }
    void window.loadURL(`${urlFor('update.html')}#${encodeURIComponent(JSON.stringify(page))}`)
    return window
  }
})

/** Opens the update window (closing one already open); see runners/updates.ts for the answer and `set`. */
export const askUpdate = updates.askUpdate

/** Brings the open update window forward; false when none is open. Without focus it never takes the keyboard. */
export function showUpdateWindow(focus: boolean): boolean {
  const window = updateWindow
  if (!window || window.isDestroyed()) {
    return false
  }
  if (focus) {
    if (isMac) {
      app.focus({ steal: true })
    }
    window.show()
    window.focus()
  } else {
    window.showInactive()
  }
  return true
}

ipcMain.handle('update:offer', () => updates.offer())
ipcMain.handle('update:answer', (_event, answer: unknown) =>
  updates.answer(answer === 'install' ? 'install' : 'later')
)
ipcMain.on('update:fit', (event, height: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window !== updateWindow || typeof height !== 'number' || height <= 0) {
    return
  }
  window.setContentSize(UPDATE_WIDTH, Math.ceil(height))
  // Why: the window is centred once when it first shows; a height that arrives before that keeps it centred too.
  if (!window.isVisible()) {
    window.center()
  }
})
