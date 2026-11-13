// Main-process side of the three small Split windows that are not Settings:
// - the move feedback overlay (glow, label, menu preview), one see-through window over one screen,
// - the shortcut list card shown while ⌥⌘ is held,
// - the About window.
// The pages live in src/renderer/{overlay,sheet}; this file only places, shows and hides them.
import { app, BrowserWindow, ipcMain, screen, type Display } from 'electron'
import type { OverlayPayload, SheetPayload, UpdatePayload, UpdateProgress } from '../shared/types'
import { durationMs, overlayLifetime, type OverlayMessage } from '../renderer/overlay/metrics'

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

let updateWindow: BrowserWindow | null = null
let answerUpdate: ((install: boolean | null) => void) | null = null

/**
 * Shows the "new version" window and resolves with the answer: true for Install Now, false for
 * Later or closing the window, null when nobody answered (this call only brought an open window
 * forward, or closeUpdateWindow closed it).
 * `focus` is for a check from the menu, where the person is waiting for it. The daily check shows
 * the window without taking focus, so keys typed in another app never land on it.
 */
export function askToInstall(payload: UpdatePayload, focus: boolean): Promise<boolean | null> {
  if (focus && isMac) {
    app.focus({ steal: true })
  }
  if (updateWindow && !updateWindow.isDestroyed()) {
    if (focus) {
      updateWindow.show()
      updateWindow.focus()
    } else {
      updateWindow.showInactive()
    }
    return Promise.resolve(null)
  }
  const window = new BrowserWindow({
    width: 400,
    height: payload.changes.length > 0 ? 420 : 270,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: payload.title,
    ...(isMac ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true }
  })
  updateWindow = window
  return new Promise((resolve) => {
    answerUpdate = (install) => {
      answerUpdate = null
      resolve(install)
      if (!window.isDestroyed()) {
        window.close()
      }
    }
    window.on('closed', () => {
      if (updateWindow === window) {
        updateWindow = null
      }
      answerUpdate?.(false)
    })
    window.webContents.once('did-finish-load', () => {
      const measure = 'Math.ceil(document.documentElement.scrollHeight)'
      void window.webContents
        .executeJavaScript(measure)
        .then((height: unknown) => {
          if (!window.isDestroyed() && typeof height === 'number' && height > 0) {
            window.setContentSize(400, height)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (window.isDestroyed()) {
            return
          }
          window.center()
          if (focus) {
            window.show()
            window.focus()
          } else {
            window.showInactive()
          }
        })
    })
    void window.loadURL(`${urlFor('update.html')}#${encodeURIComponent(JSON.stringify(payload))}`)
  })
}

/** Passes download progress to the open update window; false when no window is open. */
export function setUpdateProgress(progress: UpdateProgress): boolean {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return false
  }
  updateWindow.webContents.send('update:progress', progress)
  return true
}

/** Closes the update window with no answer, when the download it shows has failed; false when none is open. */
export function closeUpdateWindow(): boolean {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return false
  }
  answerUpdate?.(null)
  return true
}

ipcMain.handle('update:answer', (_event, install: boolean) => answerUpdate?.(install === true))
