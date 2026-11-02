// The Accessibility guide (SplitAccessibilityGuideController.m): a small window that shows which
// switch to turn on, opens System Settings beside it, and once permission arrives shows the first
// shortcut to try until closed.
import { execFile } from "node:child_process";
import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { runningPids } from "./apps.ts";

const ACCESSIBILITY_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const PRIVACY_URL = "x-apple.systempreferences:com.apple.preference.security";
const OPEN_SETTINGS_DELAY_MS = 600;
const WIDTH = 396;

let guideWindow: BrowserWindow | null = null;

/** Opens System Settings on the Accessibility list. */
export async function openAccessibilitySettings(): Promise<void> {
  const settingsOpen = (await runningPids("com.apple.systempreferences")).length > 0;
  if (!settingsOpen) {
    void shell.openExternal(ACCESSIBILITY_URL);
    return;
  }
  // Why: while System Settings is already open, the Accessibility link often lands on the parent
  // Privacy & Security page (macOS 26.1); going there first and then on lands on the right pane.
  void shell.openExternal(PRIVACY_URL);
  setTimeout(() => void shell.openExternal(ACCESSIBILITY_URL), 1000);
}

/**
 * Shows the guide on the left third of the screen, above System Settings, and opens System
 * Settings a moment later unless `trusted` says permission is already on. `register` puts Split in
 * the Accessibility list (it asks macOS once).
 */
export function showGuide(options: { preload: string; url: string; register: () => void; trusted: () => boolean }): void {
  if (guideWindow && !guideWindow.isDestroyed()) {
    guideWindow.show();
    guideWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: WIDTH,
    height: 520,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    ...(process.platform === "darwin" ? { titleBarStyle: "hidden" as const } : {}),
    webPreferences: { preload: options.preload, contextIsolation: true, sandbox: false },
  });
  guideWindow = window;
  // Stay above System Settings so the steps remain visible while the switch is flipped.
  window.setAlwaysOnTop(true, "floating");
  window.on("closed", () => {
    if (guideWindow === window) guideWindow = null;
  });
  window.webContents.once("did-finish-load", () => {
    void window.webContents
      // Why: the page draws after it has read the state, so wait for its content before measuring.
      .executeJavaScript(`new Promise((done) => {
        const measure = () => {
          const page = document.querySelector(".guide");
          if (!page || [...page.querySelectorAll("img")].some((img) => !img.complete)) return void requestAnimationFrame(measure);
          done(Math.ceil(page.getBoundingClientRect().height));
        };
        measure();
      })`)
      .then((height: unknown) => {
        if (!window.isDestroyed() && typeof height === "number" && height > 0) window.setContentSize(WIDTH, height);
      })
      .catch(() => undefined)
      .finally(() => {
        if (window.isDestroyed()) return;
        const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
        const bounds = window.getBounds();
        // Sit on the left third of the screen; System Settings usually opens near the centre.
        const x = area.x + Math.max(24, Math.round((area.width / 3 - bounds.width) / 2));
        const y = area.y + Math.round((area.height - bounds.height) / 2);
        window.setPosition(x, y);
        if (process.platform === "darwin") app.focus({ steal: true });
        window.show();
        window.focus();
      });
  });
  void window.loadURL(options.url);
  options.register();
  setTimeout(() => {
    if (!window.isDestroyed() && !options.trusted()) void openAccessibilitySettings();
  }, OPEN_SETTINGS_DELAY_MS);
}

/**
 * Called when permission arrives: the page turns into the "try a shortcut" view, and the window
 * takes that view's height, keeping its top edge, and stays until closed.
 */
export function guideGranted(): void {
  const window = guideWindow;
  if (!window || window.isDestroyed()) return;
  void window.webContents
    // Why: two frames, so React has drawn the new view before it is measured.
    .executeJavaScript(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() =>
      done(Math.ceil(document.querySelector(".guide")?.getBoundingClientRect().height ?? 0)))))`)
    .then((height: unknown) => {
      if (!window.isDestroyed() && typeof height === "number" && height > 0) window.setContentSize(WIDTH, height);
    })
    .catch(() => undefined)
    .finally(() => {
      if (!window.isDestroyed()) window.show();
    });
}

/** "Already on but not working?": clears Split's Accessibility entry so it can be turned on again. */
function resetPermission(register: () => void): void {
  execFile("/usr/bin/tccutil", ["reset", "Accessibility", "im.runners.Split"], () => {
    register();
    void openAccessibilitySettings();
  });
}

export function registerGuideIpc(register: () => void): void {
  ipcMain.handle("guide:later", () => guideWindow?.close());
  ipcMain.handle("guide:reset", () => resetPermission(register));
}
