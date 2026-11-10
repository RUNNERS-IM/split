// Split: a menu bar / tray app that moves the window in front with keyboard shortcuts.
//
// Flow of one shortcut: globalShortcut hears the keys → `perform` asks the native module what is
// on screen → `Engine` (src/core) works out where windows go with the macOS JavaScript math →
// the native module moves them → the overlay shows where they went.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { ALL, type Action, cycleStep } from "../core/actions.ts";
import { Engine, type Outcome, type Snapshot, screenContaining, screensInConsistentOrder } from "../core/engine.ts";
import { Rect } from "../core/geometry.ts";
import { shouldTurnOnAtLogin } from "../core/loginDefault.ts";
import { defaultShortcut, KeyCombo } from "../core/shortcuts.ts";
import type { LinkKind, OverlayPayload, Settings, SettingsTab, SheetPayload, ViewState } from "../shared/types";
import { removeLoginItem, runningPids } from "./apps.ts";
import { displayChangeLabel, recordSoon, startDisplayWatcher } from "./displays.ts";
import { applyShape, currentDisplays, LAYOUT_PANEL_ID, layoutMenuItems, layoutPanel, layoutRestoringForDisplays, layouts, onLayoutsChanged, restoreLayout, setupLayouts, SHAPES, type LayoutShape } from "./layouts.ts";
import { announceState, phoneView, resetPassword, sendCode, setupPhone, signIn, signOut } from "./phone.ts";
import { guideGranted, openAccessibilitySettings, registerGuideIpc, showGuide } from "./guide.ts";
import { currentLanguage, loadLanguage, rightToLeft, strings, t } from "./i18n.ts";
import { accelerator, displayShortcut, displayText } from "./keys.ts";
import { createOverlay, fromDip, hideFeedback, hideSheet, showFeedback, showSheet } from "./overlay.ts";
import { bindings, loadSettings, sanitize, saveSettings, shortcutText } from "./settings.ts";
import { checkForUpdatesNow, startUpdater } from "./updater.ts";
import { proSublabel } from "./pro.ts";
import { preparePanel, setupTrayPanel, showPanelAtPointer, togglePanelUnder } from "./trayPanel.ts";

const WEBSITE_URL = "https://runners.im/tools/split";
const ISSUES_URL = "https://github.com/RUNNERS-IM/split/issues";
/** The App Store build is made with SPLIT_STORE=1; Apple updates it, so it has no update check. */
const STORE = process.env.SPLIT_STORE === "1" || process.mas === true;
const MAC = process.platform === "darwin";

/** Apps where Split's shortcuts always stay off: they use the same keys, or they are Split itself. */
const BLOCKED_APPS = new Set(["com.adobe.Photoshop", "com.divisiblebyzero.Spectacle", "im.runners.Split", "com.valvesoftware.steam"]);

/** Settings sections in the order the macOS settings window and the shortcut list show them. */
const SECTIONS: [string, Action[]][] = [
  ["SectionBasic", ["MoveToCenter", "MoveToFullscreen"]],
  ["SectionArrange", ["ArrangeWindows"]],
  ["SectionHalves", ["MoveToLeftHalf", "MoveToRightHalf", "MoveToTopHalf", "MoveToBottomHalf"]],
  ["SectionCorners", ["MoveToUpperLeft", "MoveToUpperRight", "MoveToLowerLeft", "MoveToLowerRight"]],
  ["SectionThirds", ["MoveToPreviousThird", "MoveToNextThird"]],
  ["SectionDisplays", ["MoveToPreviousDisplay", "MoveToNextDisplay"]],
  ["SectionSize", ["MakeLarger", "MakeSmaller"]],
  ["SectionHistory", ["UndoLastMove", "RedoLastMove"]],
];

/** Tray menu groups, in the same order as the shortcut settings. */
const MENU_GROUPS: Action[][] = [
  ["MoveToCenter", "MoveToFullscreen", "ArrangeWindows"],
  ["MoveToLeftHalf", "MoveToRightHalf", "MoveToTopHalf", "MoveToBottomHalf"],
  ["MoveToUpperLeft", "MoveToUpperRight", "MoveToLowerLeft", "MoveToLowerRight"],
  ["MoveToPreviousThird", "MoveToNextThird"],
  ["MoveToPreviousDisplay", "MoveToNextDisplay"],
  ["MakeLarger", "MakeSmaller"],
  ["UndoLastMove", "RedoLastMove"],
];

// ---------------------------------------------------------------------------------------------
// Native module

type NativeRect = { x: number; y: number; width: number; height: number }
/** `app` is the name people see; `bundle` is the bundle id (macOS) or executable name. */
type NativeWindow = { id: number; rect: NativeRect; app: string; bundle: string; title: string }
type NativeSnapshot = {
  active?: NativeWindow | null;
  /** `id` stays the same when the same monitor comes back (the display UUID on macOS). */
  screens: { frame: NativeRect; workArea: NativeRect; scale: number; primary: boolean; id: string }[];
  windows: NativeWindow[];
  refusingApp?: string | null;
}
type NativeEvent = { type: "modifiers"; flags: number } | { type: "activated"; app: { id: string; name: string } };
type Native = {
  snapshot(withWindows: boolean): NativeSnapshot;
  apply(moves: { id: number; rect: NativeRect }[]): void;
  isTrusted(prompt: boolean): boolean;
  frontmostApp(): { id: string; name: string } | null;
  watch(callback: (event: NativeEvent) => void): void;
}

function resourcePath(...parts: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...parts) : join(app.getAppPath(), "resources", ...parts);
}

/**
 * The native module (native/, napi-rs). The build leaves one file per system and CPU, plus one
 * file for both Mac CPUs; a dev run reads native/, a packaged app Resources/native/.
 */
function loadNative(): Native {
  const dir = app.isPackaged ? join(process.resourcesPath, "native") : join(app.getAppPath(), "native");
  const names = readdirSync(dir).filter((name) => name.endsWith(".node"));
  const file =
    names.find((name) => name.startsWith(`split-native.${process.platform}-${process.arch}`)) ??
    names.find((name) => name === `split-native.${process.platform}-universal.node`);
  if (!file) {throw new Error(`no split-native.${process.platform}-${process.arch}*.node in ${dir}; run pnpm native`);}
  return createRequire(import.meta.url)(join(dir, file)) as Native;
}

const native = loadNative();

function toSnapshot(raw: NativeSnapshot): Snapshot {
  const window = (w: NativeWindow) => ({ id: w.id, rect: Rect.from(w.rect), app: w.app });
  return {
    active: raw.active ? window(raw.active) : null,
    // Why: macOS gives window and screen positions in points already, so the gap needs no scaling there.
    screens: raw.screens.map((s) => ({ frame: Rect.from(s.frame), workArea: Rect.from(s.workArea), scale: MAC ? 1 : s.scale, primary: s.primary })),
    windows: raw.windows.map(window),
  };
}

// ---------------------------------------------------------------------------------------------
// State

let settings: Settings;
let engine: Engine;
let tray: Tray | null = null;
let trayTimer: NodeJS.Timeout | null = null;
let settingsWindow: BrowserWindow | null = null;
/** Actions whose keys another app already holds. */
let failures: Action[] = [];
let refusingApp: string | null = null;
let pausedUntil: Date | null = null;
/** The shortcuts switch at the top of the tray panel was turned off; they stay off until it is turned on (not kept over a restart). */
let switchedOff = false;
let pauseTimer: NodeJS.Timeout | null = null;
let recording = false;
let frontApp: { id: string; name: string } | null = null;
let trusted = false;
let conflictingApps: string[] = [];

function shortcutLabel(action: Action): string {
  return displayText(shortcutText(settings, action));
}

function shortcutsBlockedByFrontApp(): boolean {
  return frontApp !== null && (BLOCKED_APPS.has(frontApp.id) || settings.disabledApps.includes(frontApp.id));
}

/** Turns Split's shortcuts on or off to match: recording, paused, or a blocked app in front. */
function syncShortcuts(): void {
  globalShortcut.unregisterAll();
  failures = [];
  if (recording || switchedOff || pausedUntil !== null || shortcutsBlockedByFrontApp()) {return;}
  for (const [action, combo] of bindings(settings)) {
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator(combo), () => perform(action));
    } catch {
      ok = false;
    }
    if (!ok) {failures.push(action);}
  }
}

function viewState(): ViewState {
  const defaults: Record<string, string> = {};
  for (const action of ALL) {
    const text = defaultShortcut(action);
    if (text) {defaults[action] = KeyCombo.parse(text)!.toText();}
  }
  return {
    settings: { ...settings, launchAtLogin: loginItemEnabled() },
    defaults,
    sections: SECTIONS,
    trusted,
    leftHalfShortcut: shortcutLabel("MoveToLeftHalf"),
    failures,
    refusingApp,
    conflictingApps,
    version: displayVersion(),
    platform: process.platform as ViewState["platform"],
    store: STORE,
    spaces: MAC && !STORE ? spacesSettings() : null,
    strings: strings(),
    locale: currentLanguage(),
    phone: phoneView(),
  };
}

/** 2.6.1030+3 inside the app is shown as 2.6.1030.3, the same as the file names and tags. */
function displayVersion(): string {
  return app.getVersion().replace("+", ".");
}

function spacesSettings(): { reorders: boolean; separate: boolean } {
  // Why: a key nobody changed is missing, and macOS then behaves as if "rearrange" were on and displays had separate Spaces.
  return { reorders: readDefault("com.apple.dock", "mru-spaces") !== "0", separate: readDefault("com.apple.spaces", "spans-displays") !== "1" };
}

function readDefault(domain: string, key: string): string | null {
  try {
    return execFileSync("defaults", ["read", domain, key], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function pushState(): void {
  const state = viewState();
  for (const window of BrowserWindow.getAllWindows()) {window.webContents.send("state:changed", state);}
}

// ---------------------------------------------------------------------------------------------
// Moving windows

const DURATION_SCALE = { short: 0.6, normal: 1, long: 1.6 } as const;

function overlayBase(): Omit<OverlayPayload, "kind" | "rects" | "title" | "shortcut" | "tip"> {
  return { feedback: settings.feedback, duration: DURATION_SCALE[settings.feedback.duration] * 1000 };
}

/** Every window action from the keyboard or the tray menu goes through here. */
function perform(action: Action): void {
  trusted = native.isTrusted(false);
  if (!trusted) {
    // Without permission nothing can move; show the way to turn it on instead of failing silently.
    askForTrust();
    return;
  }
  let raw: NativeSnapshot;
  try {
    raw = native.snapshot(action === "ArrangeWindows");
  } catch (error) {
    console.error(`split: ${action}:`, error);
    return;
  }
  const snapshot = toSnapshot(raw);
  let outcome: Outcome;
  try {
    outcome = engine.plan(action, snapshot, settings.gap);
  } catch (error) {
    console.error(`split: ${action}:`, error);
    return;
  }
  const activeApp = snapshot.active?.app || null;
  try {
    native.apply(outcome.moves.map((m) => ({ id: m.id, rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height } })));
  } catch (error) {
    console.error(`split: ${action}:`, error);
    // Why: shown in settings so a shortcut that does nothing has a reason.
    if (activeApp) {setRefusingApp(activeApp);}
    return;
  }
  setRefusingApp(raw.refusingApp ?? (refusingApp === activeApp ? null : refusingApp));
  showOutcome(action, outcome, snapshot);
  recordSoon();
}

function setRefusingApp(name: string | null): void {
  if (refusingApp === name) {return;}
  refusingApp = name;
  pushState();
}

function showOutcome(action: Action, outcome: Outcome, snapshot: Snapshot): void {
  const feedback = outcome.feedback;
  if (feedback.kind === "Failed") {
    shell.beep();
    return;
  }
  if (settings.feedback.style === "off" && feedback.kind === "Moved") {return;}
  const keys = shortcutLabel(action);
  const areaOf = (rect: Rect) => screenContaining(rect, snapshot.screens)?.workArea ?? null;
  const base = overlayBase();
  if (feedback.kind === "Moved" || feedback.kind === "Arranged") {
    const rects = outcome.moves.map((m) => m.rect);
    if (rects.length === 0) {return;}
    const title = feedback.kind === "Arranged" ? t("ArrangedCount", feedback.count) : movedTitle(action, rects[0]!, areaOf(rects[0]!));
    showFeedback({ ...base, kind: "frame", rects, title, shortcut: keys, tip: nextTip(action) });
    return;
  }
  if (settings.feedback.style === "off") {return;}
  const area =
    (snapshot.active && areaOf(snapshot.active.rect)) ??
    (outcome.moves[0] && areaOf(outcome.moves[0].rect)) ??
    screensInConsistentOrder(snapshot.screens)[0]?.workArea;
  if (!area) {return;}
  const title = feedback.kind === "NothingToArrange" ? t("NothingToArrange") : t("ArrangeUndone");
  if (feedback.kind === "NothingToArrange") {shell.beep();}
  showFeedback({ ...base, kind: "label", rects: [area], title, shortcut: keys, tip: "" });
}

const SIDES: Partial<Record<Action, string>> = {
  MoveToLeftHalf: "Side.Left",
  MoveToRightHalf: "Side.Right",
  MoveToTopHalf: "Side.Top",
  MoveToBottomHalf: "Side.Bottom",
};

/** "Left Half", then "Left 2/3" and "Left 1/3" as the same shortcut is pressed again; corners add the step to their name. */
function movedTitle(action: Action, rect: Rect, area: Rect | null): string {
  const step = area ? cycleStep(action, rect, area) : null;
  if (!step) {return t(action);}
  const side = SIDES[action];
  return `${side ? t(side) : t(action)} ${step}`;
}

/**
 * Tips shown once each, one per move, while the label is on; the one that fits the action just
 * used comes first. Empty once every tip has been shown. Same order as the macOS app.
 */
function nextTip(action: Action): string {
  if (settings.feedback.style === "off" || !settings.feedback.showShortcut) {return "";}
  const shown = settings.shownTips;
  const half = ["MoveToLeftHalf", "MoveToRightHalf", "MoveToTopHalf", "MoveToBottomHalf"].includes(action);
  const tips: [string, boolean, string][] = [
    ["TipCycle", half, ""],
    ["TipFullscreenAgain", action === "MoveToFullscreen", ""],
    ["TipUndo", false, shortcutLabel("UndoLastMove")],
    ["TipSheet", false, ""],
    ["TipArrange", false, shortcutLabel("ArrangeWindows")],
  ];
  let chosen = tips.find(([name, fits]) => !shown.includes(name) && fits);
  // Tips tied to another action wait for that action.
  chosen ??= tips.find(([name]) => !shown.includes(name) && name !== "TipCycle" && name !== "TipFullscreenAgain");
  if (!chosen) {return "";}
  settings = { ...settings, shownTips: [...shown, chosen[0]] };
  saveSettings(settings);
  if (chosen[0] === "TipSheet" && !settings.shortcutSheet) {return "";}
  return chosen[2] ? t(chosen[0], chosen[2]) : t(chosen[0]);
}

// ---------------------------------------------------------------------------------------------
// Shortcut list (hold ⌥⌘)

const ALT = 2;
const LOGO = 8;
let sheetTimer: NodeJS.Timeout | null = null;
let sheetVisible = false;

function sheetPayload(): SheetPayload {
  return {
    strings: strings(),
    sections: SECTIONS.map(([title, actions]) => ({
      title: t(title),
      rows: actions.map((name) => ({ name, keys: shortcutLabel(name) || "—" })),
    })),
  };
}

function openSheet(): void {
  sheetVisible = true;
  showSheet(sheetPayload());
}

function onModifiers(flags: number): void {
  if (sheetTimer) {clearTimeout(sheetTimer);}
  sheetTimer = null;
  if (flags === (ALT | LOGO) && settings.shortcutSheet && !recording) {
    sheetTimer = setTimeout(openSheet, 1000);
  } else if (sheetVisible) {
    sheetVisible = false;
    hideSheet();
  }
}

// ---------------------------------------------------------------------------------------------
// Tray

function menuIcon(name: string): Electron.NativeImage {
  return nativeImage.createFromPath(resourcePath("menu", `${name}Template.png`));
}

/** A small filled circle for the status line, green when shortcuts work and orange when not, as wide as the menu pictures. */
function dot(color: [number, number, number]): Electron.NativeImage {
  const width = 44;
  const height = 32;
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2);
      const alpha = Math.max(0, Math.min(1, 5.5 - distance));
      const i = (y * width + x) * 4;
      buffer[i] = color[2];
      buffer[i + 1] = color[1];
      buffer[i + 2] = color[0];
      buffer[i + 3] = Math.round(alpha * 255);
    }
  }
  return nativeImage.createFromBitmap(buffer, { width, height, scaleFactor: 2 });
}

function statusLine(): { label: string; on: boolean } {
  if (!trusted) {return { label: t("ShortcutsOffNoPermission"), on: false };}
  if (switchedOff) {return { label: t("ShortcutsOff"), on: false };}
  if (pausedUntil) {
    const time = pausedUntil.toLocaleTimeString(currentLanguage(), { hour: "numeric", minute: "2-digit" });
    return { label: t("ShortcutsOffForHour", time), on: false };
  }
  if (shortcutsBlockedByFrontApp()) {return { label: t("ShortcutsOffForApplication", frontApp?.name ?? ""), on: false };}
  return { label: t("ShortcutsOn"), on: true };
}

/** The tray menu's items. `panel` is the macOS tray panel (trayPanel.ts): switches, the layout card and "More". */
function menuTemplate(panel: boolean): MenuItemConstructorOptions[] {
  trusted = native.isTrusted(false);
  const status = statusLine();
  const front = MAC ? native.frontmostApp() : frontApp;
  const actionItem = (action: Action): MenuItemConstructorOptions => {
    const text = shortcutText(settings, action);
    const combo = text ? KeyCombo.parse(text) : null;
    const item: MenuItemConstructorOptions = {
      label: t(action),
      icon: menuIcon(action),
      // Why: the menu is shown while another app is in front; doing it now would move the menu's own window.
      click: () => setTimeout(() => perform(action), 0),
    };
    if (combo && MAC) {
      item.accelerator = accelerator(combo);
      item.registerAccelerator = false;
    } else if (combo) {
      item.sublabel = displayShortcut(combo);
    }
    return item;
  };
  const statusClick = () => {
    if (!trusted) {
      askForTrust();
    } else if (switchedOff || pausedUntil) {
      resume();
    }
  };
  // Why: the macOS panel draws its account line itself (trayPanel.ts); the plain menu has the same line as text.
  const phone = phoneView();
  const template: MenuItemConstructorOptions[] = [
    ...(panel ? [] : [{ label: phone.email ?? t("AccountSignInLine"), click: () => showSettings("account", !phone.email) }, { type: "separator" as const }]),
    panel
      ? {
          // Why: on/off lines are switches in the panel (decision 2026-11-05 "메뉴 통일" 1A); off here means off until
          // it is turned on again, while "Turn Off Shortcuts" below still offers an hour or one app.
          id: "shortcuts",
          label: status.label,
          type: "checkbox",
          checked: status.on,
          enabled: trusted ? !(front && BLOCKED_APPS.has(front.id) && shortcutsBlockedByFrontApp()) : true,
          click: () => {
            if (status.on) {switchOff();}
            else if (trusted && shortcutsBlockedByFrontApp() && front) {toggleApp(front);}
            else {statusClick();}
          },
        }
      : {
          label: status.label,
          icon: dot(status.on ? [52, 199, 89] : [255, 149, 0]),
          click: statusClick,
        },
    { type: "separator" },
    ...layoutMenuItems(() => {}, panel),
    {
      label: t("Disable"),
      icon: menuIcon("pause"),
      submenu: [
        { label: t("DisableForAnHour"), type: "checkbox", checked: pausedUntil !== null, click: () => (pausedUntil ? resume() : pauseForAnHour()) },
        ...(front && !BLOCKED_APPS.has(front.id)
          ? [{
              label: t("DisableForApplication", front.name),
              type: "checkbox" as const,
              checked: settings.disabledApps.includes(front.id),
              click: () => toggleApp(front),
            }]
          : []),
      ],
    },
    { label: t("ShowShortcutSheet"), icon: menuIcon("sheet"), click: () => setTimeout(openSheet, 200) },
  ];
  // Why: the panel shows the first two groups (7 lines) and folds the other 12 under "More" (decision 2026-11-02
  // "Split 메뉴는 7줄 + 더 보기로 펼치기"), so the menu fits on a laptop screen; the plain menu elsewhere keeps all.
  const shown = panel ? MENU_GROUPS.slice(0, 2) : MENU_GROUPS;
  for (const group of shown) {
    template.push({ type: "separator" }, ...group.map(actionItem));
  }
  if (panel) {
    const folded: MenuItemConstructorOptions[] = [];
    for (const group of MENU_GROUPS.slice(2)) {
      if (folded.length > 0) {folded.push({ type: "separator" });}
      folded.push(...group.map(actionItem));
    }
    template.push({ id: "more", label: t("MoreActions"), submenu: folded });
  }
  template.push(
    { type: "separator" },
    { label: t("Settings"), icon: menuIcon("settings"), accelerator: "Command+,", registerAccelerator: false, click: () => showSettings() },
    { label: t("HelpFeedback"), icon: menuIcon("help"), click: () => void shell.openExternal(ISSUES_URL) },
    { type: "separator" },
    { label: t("QuitSplit"), icon: menuIcon("quit"), accelerator: "Command+Q", registerAccelerator: false, click: () => app.quit() },
  );
  return template;
}

function trayFrames(): Electron.NativeImage[] {
  const frames: Electron.NativeImage[] = [];
  for (let i = 0; i < 70; i++) {
    const image = nativeImage.createFromPath(resourcePath("tray", `frame${String(i).padStart(2, "0")}Template.png`));
    if (!MAC) {image.setTemplateImage(false);}
    frames.push(image);
  }
  return frames;
}

function updateTray(): void {
  if (!settings.showTrayIcon) {
    if (trayTimer) {clearInterval(trayTimer);}
    trayTimer = null;
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) {return;}
  const frames = trayFrames();
  tray = new Tray(frames[0]);
  tray.setToolTip(`Split ${displayVersion()}`);
  const open = () => {
    if (!tray) {return;}
    if (MAC) {
      togglePanelUnder(tray);
    } else {
      tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate(false)));
    }
  };
  tray.on("click", open);
  tray.on("right-click", open);
  let frame = 0;
  // The icon's panes slide between halves, big + two and 2 × 2, 15 frames a second like the macOS app.
  trayTimer = setInterval(() => {
    frame = (frame + 1) % frames.length;
    tray?.setImage(frames[frame]);
  }, 1000 / 15);
}

function showMenuAtPointer(): void {
  if (MAC) {
    showPanelAtPointer();
  } else {
    Menu.buildFromTemplate(menuTemplate(false)).popup();
  }
}

function switchOff(): void {
  switchedOff = true;
  syncShortcuts();
  pushState();
}

function pauseForAnHour(): void {
  pausedUntil = new Date(Date.now() + 3600_000);
  pauseTimer = setTimeout(resume, 3600_000);
  syncShortcuts();
}

function resume(): void {
  if (pauseTimer) {clearTimeout(pauseTimer);}
  pauseTimer = null;
  pausedUntil = null;
  switchedOff = false;
  syncShortcuts();
  pushState();
}

function toggleApp(front: { id: string; name: string }): void {
  const disabled = settings.disabledApps.includes(front.id)
    ? settings.disabledApps.filter((id) => id !== front.id)
    : [...settings.disabledApps, front.id];
  settings = { ...settings, disabledApps: disabled };
  saveSettings(settings);
  frontApp = front;
  syncShortcuts();
}

// ---------------------------------------------------------------------------------------------
// Windows

function preloadPath(): string {
  return join(import.meta.dirname, "../preload/index.cjs");
}

/** Where a page lives: the dev server while developing, the built file otherwise. */
export function rendererUrl(name: string): string {
  const page = name.replace(/\.html$/, "");
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServer) {return `${devServer}/${page}.html`;}
  return pathToFileURL(join(import.meta.dirname, "../renderer", `${page}.html`)).toString();
}

/** Split shows no menu bar of its own, but text fields still need copy and paste, and ⌘W closes windows. */
function appMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      role: "appMenu",
      submenu: [
        { label: t("AboutSplit"), click: () => showSettings("about") },
        { type: "separator" },
        // Why: ⌘, opens Settings from any Split window (shared decision 2026-11-07).
        { label: t("Settings"), accelerator: "CommandOrControl+,", click: () => showSettings() },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ]);
}

/** Opens the settings window, on `tab` when one is named; `signIn` also opens the sign-in sheet over the Account tab. */
function showSettings(tab?: SettingsTab, signIn = false): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tab) {settingsWindow.webContents.send("settings:tab", tab, signIn);}
    settingsWindow.show();
    settingsWindow.focus();
    if (MAC) {app.focus({ steal: true });}
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 656,
    height: 700,
    minWidth: 656,
    minHeight: 420,
    title: t("SettingsWindowTitle"),
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    // Why: macOS puts the native title next to the window buttons; the page draws it centered instead.
    ...(MAC ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 12, y: 10 } } : {}),
    webPreferences: { preload: preloadPath(), sandbox: false },
  });
  settingsWindow.on("page-title-updated", (event) => event.preventDefault());
  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
    if (MAC) {app.focus({ steal: true });}
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
    if (recording) {
      recording = false;
      syncShortcuts();
    }
  });
  void settingsWindow.loadURL(`${rendererUrl("settings")}${tab ? `?tab=${tab}${signIn ? "&signIn=1" : ""}` : ""}`);
}

// ---------------------------------------------------------------------------------------------
// Login item

function loginItemEnabled(): boolean {
  if (!app.isPackaged) {return settings.launchAtLogin;}
  return app.getLoginItemSettings().openAtLogin;
}

function setLoginItem(enabled: boolean): void {
  if (!app.isPackaged) {return;}
  app.setLoginItemSettings({ openAtLogin: enabled });
}

/** Marks that the one-time "open at login" default was applied on this Mac (see core/loginDefault.ts). */
const LOGIN_DEFAULT_MARKER = "open-at-login-default";

/** Every RUNNERS app adds itself to the login items once; settings can turn it off and that sticks. */
function applyLoginDefault(): void {
  if (!app.isPackaged) {return;}
  const marker = join(app.getPath("userData"), LOGIN_DEFAULT_MARKER);
  const applied = existsSync(marker);
  if (shouldTurnOnAtLogin({ applied, store: STORE, wanted: settings.launchAtLogin, on: loginItemEnabled() })) {
    setLoginItem(true);
  }
  if (applied || STORE) {return;}
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(marker, "");
  } catch {
    // Left for the next launch.
  }
}

// ---------------------------------------------------------------------------------------------
// Pages talking to the main process

/** Saves settings from the settings window or a tray panel switch and applies what changed. */
function changeSettings(next: Settings): ViewState {
  const previous = settings;
  settings = sanitize(next);
  saveSettings(settings);
  if (JSON.stringify(previous.shortcuts) !== JSON.stringify(settings.shortcuts) ||
      JSON.stringify(previous.disabledApps) !== JSON.stringify(settings.disabledApps)) {
    syncShortcuts();
  }
  if (previous.launchAtLogin !== settings.launchAtLogin || loginItemEnabled() !== settings.launchAtLogin) {
    setLoginItem(settings.launchAtLogin);
  }
  if (previous.showTrayIcon !== settings.showTrayIcon) {updateTray();}
  if (!STORE && previous.autoUpdate !== settings.autoUpdate) {startUpdater(settings.autoUpdate);}
  const state = viewState();
  pushState();
  return state;
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => viewState());
  ipcMain.handle("settings:save", (_event, next: Settings) => changeSettings(next));
  ipcMain.handle("shortcuts:restore", () => {
    settings = { ...settings, shortcuts: {} };
    saveSettings(settings);
    syncShortcuts();
    pushState();
    return viewState();
  });
  ipcMain.handle("shortcuts:recording", (_event, value: boolean) => {
    recording = value;
    // Why: menu keys such as ⌘Q and ⌘W would be taken by the app menu before the recorder sees them.
    Menu.setApplicationMenu(value ? null : appMenu());
    syncShortcuts();
  });
  ipcMain.handle("feedback:preview", () => {
    if (!settingsWindow) {return;}
    const bounds = settingsWindow.getBounds();
    showFeedback({
      ...overlayBase(),
      kind: "frame",
      rects: [Rect.from(fromDip(bounds))],
      title: t("MoveToCenter"),
      shortcut: shortcutLabel("MoveToCenter"),
      tip: "",
    });
  });
  ipcMain.handle("link:open", (_event, kind: LinkKind) => openLink(kind));
  ipcMain.handle("phone:signIn", async (_event, mode: unknown, email: unknown, password: unknown, code: unknown) => ({
    error: await signIn(
      mode === "signup" ? "signup" : "login",
      String(email),
      String(password),
      typeof code === "string" ? code : undefined,
    ),
    state: viewState(),
  }));
  ipcMain.handle("phone:sendCode", async (_event, purpose: unknown, email: unknown) => ({
    error: await sendCode(purpose === "reset" ? "reset" : "signup", String(email), currentLanguage()),
    state: viewState(),
  }));
  ipcMain.handle("phone:resetPassword", async (_event, email: unknown, code: unknown, password: unknown) => ({
    error: await resetPassword(String(email), String(code), String(password)),
    state: viewState(),
  }));
  ipcMain.handle("phone:signOut", () => {
    signOut();
    return viewState();
  });
  ipcMain.handle("update:check", () => checkForUpdatesNow());
  ipcMain.handle("trust:request", () => {
    trusted = native.isTrusted(true);
    return trusted;
  });
}

function openLink(kind: LinkKind): void {
  switch (kind) {
    case "accessibility":
      void openAccessibilitySettings();
      break;
    case "spaces":
      void shell.openExternal("x-apple.systempreferences:com.apple.Desktop-Settings.extension");
      break;
    case "help":
    case "issues":
      void shell.openExternal(ISSUES_URL);
      break;
    default:
      void shell.openExternal(WEBSITE_URL);
  }
}

// ---------------------------------------------------------------------------------------------
// Start

/** Accessibility can be granted at any time in System Settings; notice it without a restart. */
function watchTrust(): void {
  setInterval(() => {
    const now = native.isTrusted(false);
    if (now === trusted) {return;}
    trusted = now;
    syncShortcuts();
    pushState();
    if (now) {guideGranted();}
  }, 1000);
}

/**
 * Homebrew and a drag into Applications replace Split.app while the old Split keeps running, and
 * the old process then loads windows and helpers from the new files and half works until it is
 * quit. When the bundle's Info.plist changes, start the new copy once it has finished copying.
 */
function watchBundle(): void {
  const plist = join(dirname(process.execPath), "..", "Info.plist");
  const read = (): string | null => {
    try {
      return readFileSync(plist, "utf8");
    } catch {
      return null;
    }
  };
  const original = read();
  if (original === null) {return;}
  let seen: string | null = null;
  setInterval(() => {
    const now = read();
    // Why: wait for two equal reads in a row so a copy still in progress is not started.
    if (now === null || now === original || now !== seen) {
      seen = now;
      return;
    }
    app.relaunch();
    app.exit(0);
  }, 3000);
}

/** Shows how to turn on Accessibility: the guide window on macOS, settings elsewhere. */
function askForTrust(): void {
  const register = () => void native.isTrusted(true);
  if (!MAC) {
    showSettings();
    register();
    return;
  }
  showGuide({ preload: preloadPath(), url: rendererUrl("guide"), register, trusted: () => native.isTrusted(false) });
}

const SPECTACLE = "com.divisiblebyzero.Spectacle";

/** Window apps whose default shortcuts are Split's: Spectacle all of them, the others ⌃⌥← and ⌃⌥→. */
const CONFLICTING_APPS: [id: string, name: string][] = [
  [SPECTACLE, "Spectacle"],
  ["com.knollsoft.Rectangle", "Rectangle"],
  ["com.crowdcafe.windowmagnet", "Magnet"],
];

/**
 * Spectacle and Split answer the same shortcuts and each counts its own turn of the repeat cycle, so
 * windows land in odd sizes. It is often a login item that starts after Split, so the running
 * apps are checked all along, not only at launch.
 */
function watchConflictingApps(): void {
  let spectacleWasRunning = false;
  let asking = false;
  const check = async () => {
    const running: string[] = [];
    let spectaclePids: number[] = [];
    for (const [id, name] of CONFLICTING_APPS) {
      const pids = await runningPids(id);
      if (pids.length === 0) {continue;}
      running.push(name);
      if (id === SPECTACLE) {spectaclePids = pids;}
    }
    if (running.join() !== conflictingApps.join()) {
      conflictingApps = running;
      pushState();
    }
    const started = spectaclePids.length > 0 && !spectacleWasRunning;
    spectacleWasRunning = spectaclePids.length > 0;
    if (started && !asking && !settings.keepSpectacle) {
      asking = true;
      await offerToQuitSpectacle(spectaclePids);
      asking = false;
    }
  };
  setTimeout(() => void check(), 800);
  setInterval(() => void check(), 5000);
}

/** Asks to quit Spectacle and take it out of the login items; "Keep Both" is remembered. */
async function offerToQuitSpectacle(pids: number[]): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: t("Migration.LegacyRunningTitle"),
    detail: t("Migration.LegacyRunningBody"),
    buttons: [t("Migration.LegacyRunningKeep"), t("Migration.LegacyRunningQuit")],
    defaultId: 1,
    cancelId: 0,
  });
  if (response !== 1) {
    settings = { ...settings, keepSpectacle: true };
    saveSettings(settings);
    pushState();
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
  await removeLoginItem("Spectacle");
}

function start(): void {
  loadLanguage();
  // Why: Chromium writes AppleTextDirection = 1 to Split's defaults when it starts in Arabic and
  // never clears it, so after a switch to another language the menus stayed mirrored.
  if (MAC && !rightToLeft()) {
    systemPreferences.removeUserDefault("AppleTextDirection");
    systemPreferences.removeUserDefault("NSForceRightToLeftWritingDirection");
  }
  const loaded = loadSettings();
  settings = loaded.settings;
  engine = new Engine();
  trusted = native.isTrusted(false);
  frontApp = native.frontmostApp();
  native.watch((event) => {
    if (event.type === "modifiers") {
      onModifiers(event.flags);
      return;
    }
    const wasBlocked = shortcutsBlockedByFrontApp();
    frontApp = event.app;
    if (wasBlocked !== shortcutsBlockedByFrontApp()) {syncShortcuts();}
  });
  registerIpc();
  registerGuideIpc(() => void native.isTrusted(true));
  Menu.setApplicationMenu(appMenu());
  createOverlay(preloadPath(), rendererUrl);
  setupLayouts({
    native,
    preload: preloadPath(),
    rendererUrl,
    gap: () => settings.gap,
    moved: (before) => {
      engine.rememberArrangement(before);
      recordSoon();
    },
  });
  startDisplayWatcher({
    settings: () => settings,
    snapshot: () => {
      const raw = native.snapshot(true);
      const snapshot = toSnapshot(raw);
      return { ...snapshot, screens: snapshot.screens.map((s, i) => ({ ...s, id: raw.screens[i].id })) };
    },
    displayIds: () => native.snapshot(false).screens.map((s) => s.id),
    apply: (moves) => native.apply(moves.map((m) => ({ id: m.id, rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height } }))),
    remember: (previous) => engine.rememberArrangement(previous),
    // A layout saved for exactly these monitors wins over rearranging by area.
    restoreSavedLayout: (ids) => {
      const layout = layoutRestoringForDisplays(ids);
      return layout ? restoreLayout(layout) : null;
    },
    onArranged: showDisplayNotice,
  });
  syncShortcuts();
  if (MAC) {
    setupTrayPanel({
      template: () => menuTemplate(true),
      layoutPanelId: LAYOUT_PANEL_ID,
      layouts: layoutPanel,
      image: (icon) => {
        const image = icon as Electron.NativeImage;
        if (typeof image?.toDataURL !== "function" || image.isEmpty()) {return null;}
        return { src: image.toDataURL({ scaleFactor: 2 }), template: image.isTemplateImage() };
      },
      proSublabel,
      account: () => ({ ...phoneView(), signInLine: t("AccountSignInLine"), connecting: t("AccountConnecting") }),
      openSettings: showSettings,
      preload: preloadPath(),
      url: rendererUrl("panel"),
    });
    preparePanel();
  }
  updateTray();
  watchTrust();
  if (MAC && app.isPackaged) {watchBundle();}
  applyLoginDefault();
  if (!STORE) {startUpdater(settings.autoUpdate);}
  if (!trusted) {askForTrust();}
  else if (loaded.firstLaunch || !settings.showTrayIcon) {showSettings();}
  if (MAC) {watchConflictingApps();}
  // Shortcuts registered before sleep can stop firing on some systems; register them again on wake.
  powerMonitor.on("resume", syncShortcuts);
  screen.on("display-metrics-changed", () => hideFeedback());
  setupPhone({ state: phoneState, run: phoneCommand, changed: pushState });
  onLayoutsChanged(announceState);
  screen.on("display-added", announceState);
  screen.on("display-removed", announceState);
}

/** What the phone app shows for this computer; also the answer to layouts.list. */
function phoneState(): unknown {
  return { displays: currentDisplays(), shapes: [...SHAPES], layouts: layouts().map(({ id, name }) => ({ id, name })) };
}

/** Runs a command from the phone app (src/main/phone.ts). Throwing answers it with ok: false. */
function phoneCommand(name: string, args: Record<string, unknown>): unknown {
  if (name === "layouts.list") {return phoneState();}
  trusted = native.isTrusted(false);
  if (!trusted) {throw new Error("untrusted");}
  if (name === "shape.apply") {
    const shape = args.shape as LayoutShape;
    if (!SHAPES.includes(shape) || typeof args.displayId !== "string") {throw new Error("bad-args");}
    return { moved: applyShape(shape, args.displayId) };
  }
  if (name === "layout.apply") {
    const layout = layouts().find((l) => l.id === args.id);
    if (!layout) {throw new Error("no-layout");}
    return { moved: restoreLayout(layout) };
  }
  if (name === "layout.restore") {
    perform("UndoLastMove");
    return {};
  }
  throw new Error("unknown-command");
}

/** "Monitors changed, so 3 windows were rearranged" (or "went back"), on the monitor under the pointer. */
function showDisplayNotice(count: number, restored: boolean): void {
  const label = displayChangeLabel(settings, count, restored, shortcutLabel("UndoLastMove"));
  if (!label) {return;}
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  showFeedback({ ...overlayBase(), kind: "label", rects: [Rect.from(fromDip(area))], title: label.title, shortcut: "", tip: label.tip });
}

/**
 * `open -g -a Split --args --menu` shows the tray menu at the pointer, for when the icon is hidden
 * behind the notch; `--perform MoveToLeftHalf` (or `--perform=MoveToLeftHalf`) runs one action, for
 * scripts and launchers. Opening Split with nothing else shows settings.
 */
function openedAgain(argv: string[]): void {
  // Why: Chromium moves the switches it knows ahead of everything else, so the action name is not
  // always right after `--perform`; it is whichever argument names an action.
  const named = argv.find((arg) => arg.startsWith("--perform="))?.slice("--perform=".length);
  const action = ALL.find((a) => a === named || (argv.includes("--perform") && argv.includes(a)));
  if (action) {perform(action);}
  else if (argv.includes("--menu")) {showMenuAtPointer();}
  // `--display-notice` (or `--display-notice=restored`) shows the notice a monitor change brings,
  // with 3 windows, so it can be seen and photographed without unplugging a monitor.
  else if (argv.some((arg) => arg.startsWith("--display-notice"))) {showDisplayNotice(3, argv.includes("--display-notice=restored"));}
  // `--guide` shows the Accessibility guide even when permission is on, for support and screenshots.
  else if (argv.includes("--guide") && MAC) {showGuide({ preload: preloadPath(), url: rendererUrl("guide"), register: () => undefined, trusted: () => native.isTrusted(false) });}
  else {showSettings();}
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Opening Split again is how people get back to settings when the tray icon is hidden.
  app.on("second-instance", (_event, argv) => {
    // Why: the new instance waits for this handler to return and, when it takes too long, decides
    // this one hung and replaces it. The menu below stays open until closed, so answer first.
    setTimeout(() => openedAgain(argv), 0);
  });
  app.on("activate", () => showSettings());
  // Split lives in the menu bar / tray; closing its last window must not quit it.
  app.on("window-all-closed", () => {});
  // Why: quitting before start-up finished (another Split took over) would throw here.
  app.on("will-quit", () => {
    if (app.isReady()) {globalShortcut.unregisterAll();}
  });
  app.on("web-contents-created", (_event, contents) => {
    // Links in pages open in the browser, never in a Split window.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) {void shell.openExternal(url);}
      return { action: "deny" };
    });
    // Why: Arabic reads right to left, so every Split page lays out mirrored, not only the title bar.
    contents.on("dom-ready", () => {
      if (rightToLeft()) {void contents.executeJavaScript(`document.documentElement.dir = "rtl"`).catch(() => undefined);}
    });
  });
  if (MAC) {app.dock?.hide();}
  void app.whenReady().then(start);
}

