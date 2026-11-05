// The tray menu on macOS: a panel Split draws (src/renderer/panel), placed under the menu bar icon like Monitor's.
// Why a panel window (NSPanel, `type: "panel"`): it takes clicks and keys without making Split the front app, so a
// window action chosen here still moves the window of the app that was in front (Split asks macOS which app is in
// front). Checked 2026-11-05 with Electron 43: the panel is focused while the front app stays the same.
import { BrowserWindow, ipcMain, screen, type Tray } from "electron";
import { convertTemplate, macShortcut, type TemplateItem } from "../core/panelItems.ts";
import type { PanelView } from "../shared/types";

// Why: the same width as Monitor's and Prompt's panels.
const WIDTH = 300;
/** Space between the menu bar and the panel, and kept free at the bottom of the screen. */
const GAP = 4;
// Why: the click that opens the panel can also send it a focus-lost event right away.
const BLUR_GRACE_MS = 400;
// Why: clicking the icon while the panel is open first takes focus from the panel (which hides it); a click that
// lands this soon after is the same click and must not open it again.
const REOPEN_GUARD_MS = 300;

export interface PanelSource {
  template(): TemplateItem[];
  layoutPanelId: string;
  /** The layout card (monitors, shapes, saved layouts) and what a chip on it runs. */
  layouts(): { card: unknown; choose: (chosen: string) => void };
  image(icon: unknown): { src: string; template: boolean } | null;
  proSublabel(): string;
  accent(): string;
  preload: string;
  url: string;
}

let panel: BrowserWindow | null = null;
let source: PanelSource | null = null;
let clicks = new Map<string, () => void>();
let choose: (chosen: string) => void = () => undefined;
let shownAt = 0;
let hiddenAt = 0;
/** Where the panel hangs from: the icon's bottom middle, or the pointer for `--menu`. */
let anchor: { x: number; y: number; centered: boolean } = { x: 0, y: 0, centered: true };
/** The items last sent to the page, to tell a switch (the panel stays open) from a command (it closes). */
let lastItems: PanelView["items"] = [];

function view(): PanelView {
  if (!source) return { items: [], accent: "#007aff" };
  const layouts = source.layouts();
  choose = layouts.choose;
  const converted = convertTemplate(source.template(), {
    image: source.image,
    layoutPanelId: source.layoutPanelId,
    layoutCard: layouts.card,
    proSublabel: source.proSublabel(),
    shortcut: macShortcut,
  });
  clicks = converted.clicks;
  lastItems = converted.items;
  return { items: converted.items, accent: source.accent() };
}

export function setupTrayPanel(from: PanelSource): void {
  source = from;
  ipcMain.handle("panel:view", () => view());
  ipcMain.handle("panel:run", (_event, id: string) => {
    const run = clicks.get(String(id));
    if (!run) return null;
    const line = findLine(String(id));
    if (line === "switch") {
      run();
      return view();
    }
    hidePanel();
    run();
    return null;
  });
  ipcMain.handle("panel:choose", (_event, chosen: string) => {
    hidePanel();
    choose(String(chosen));
  });
  ipcMain.on("panel:fit", (event, height: number) => {
    if (!panel || BrowserWindow.fromWebContents(event.sender) !== panel || !Number.isFinite(height) || height <= 0) return;
    place(Math.ceil(height));
  });
  ipcMain.on("panel:close", () => hidePanel());
}

function findLine(id: string): string | null {
  const search = (items: PanelView["items"]): string | null => {
    for (const item of items) {
      if ((item.kind === "item" || item.kind === "switch") && item.id === id) return item.kind;
      if (item.kind === "group") {
        const found = search(item.items);
        if (found) return found;
      }
    }
    return null;
  };
  return search(lastItems);
}

function create(): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: 400,
    useContentSize: true,
    show: false,
    frame: false,
    type: "panel",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: "menu",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    title: "Split",
    webPreferences: { preload: source!.preload, sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  // Why: a menu shows over full-screen apps and on every Space, so the panel does too.
  window.setAlwaysOnTop(true, "pop-up-menu");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  window.on("blur", () => {
    if (Date.now() - shownAt < BLUR_GRACE_MS) return;
    hidePanel();
  });
  void window.loadURL(source!.url);
  return window;
}

/** Builds the panel ahead of time so the first click opens it at once. */
export function preparePanel(): void {
  if (!panel || panel.isDestroyed()) panel = create();
}

/** Fits the panel to `height` (its content) and keeps it on the screen it opens on; a taller menu scrolls. */
function place(height: number): void {
  if (!panel) return;
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const area = display.workArea;
  const fitted = Math.min(height, area.height - 2 * GAP);
  let x = anchor.centered ? Math.round(anchor.x - WIDTH / 2) : anchor.x;
  let y = anchor.y + (anchor.centered ? GAP : 0);
  x = Math.min(Math.max(x, area.x + GAP), area.x + area.width - WIDTH - GAP);
  y = Math.min(Math.max(y, area.y), area.y + area.height - fitted - GAP);
  panel.setBounds({ x, y, width: WIDTH, height: fitted }, false);
}

export function isPanelOpen(): boolean {
  return !!panel && !panel.isDestroyed() && panel.isVisible();
}

export function hidePanel(): void {
  if (!isPanelOpen()) return;
  hiddenAt = Date.now();
  panel!.hide();
}

/** Opens the panel under the tray icon, or closes it when it is open. */
export function togglePanelUnder(tray: Tray): void {
  if (isPanelOpen()) {
    hidePanel();
    return;
  }
  if (Date.now() - hiddenAt < REOPEN_GUARD_MS) return;
  const bounds = tray.getBounds();
  showAt({ x: Math.round(bounds.x + bounds.width / 2), y: bounds.y + bounds.height, centered: true });
}

/** Opens the panel with its top-left corner at the pointer (`--menu`, for when the icon is hidden by the notch). */
export function showPanelAtPointer(): void {
  const point = screen.getCursorScreenPoint();
  showAt({ x: point.x, y: point.y, centered: false });
}

function showAt(where: typeof anchor): void {
  preparePanel();
  anchor = where;
  panel!.webContents.send("panel:shown", view());
  const [, height] = panel!.getContentSize();
  place(height);
  shownAt = Date.now();
  panel!.show();
  panel!.focus();
}

