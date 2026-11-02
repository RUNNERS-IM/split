// Layouts (Split Pro): the shapes that arrange one monitor at once, layouts saved by name, and
// the "Layouts" section of the tray menu. Port of SplitLayouts.m and SplitLayoutMenu.m.
//
// Saved layouts are kept as Layouts.json in the app data folder
// (~/Library/Application Support/Split, %APPDATA%\Split, ~/.config/Split). On macOS that is the
// very file the macOS app (2.6.1030 and earlier) wrote, in the same format, so its layouts are
// here from the first launch with nothing to carry over, and both apps can read each other's.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, BrowserWindow, ipcMain, type MenuItemConstructorOptions, nativeImage, screen } from "electron";
import type { Move } from "../core/engine.ts";
import { layoutRects } from "../core/arrange.ts";
import { Rect, rectWithGap } from "../core/geometry.ts";
import type { LayoutSaveAnswer, LayoutSavePayload } from "../shared/types";
import { t } from "./i18n.ts";
import { setupPro } from "./pro.ts";

const isMac = process.platform === "darwin";

// ---------------------------------------------------------------------------------------------
// Native module (the part of it this file uses; index.ts loads it)

interface NativeRect { x: number; y: number; width: number; height: number }
interface NativeWindow {
  id: number;
  rect: NativeRect;
  /** The name people see. */
  app: string;
  /** Bundle id (macOS) or executable name, as the macOS app saved. */
  bundle?: string;
  /** Window title; windows match by app and title first, then by order within their app. */
  title?: string;
}
interface NativeScreen {
  frame: NativeRect;
  workArea: NativeRect;
  scale: number;
  primary: boolean;
  /** Display UUID (macOS), as the macOS app saved. Electron's display id stands in when it is missing. */
  id?: string;
}
export interface LayoutNative {
  snapshot(withWindows: boolean): { screens: NativeScreen[]; windows: NativeWindow[] };
  apply(moves: { id: number; rect: NativeRect }[]): void;
}

export interface LayoutOptions {
  native: LayoutNative;
  preload: string;
  rendererUrl: (page: string) => string;
  /** Space between windows in points, from settings. */
  gap: () => number;
  /**
   * Runs after windows moved, with where each was before, so one undo can put them all back,
   * and how many moved.
   */
  moved: (before: Move[], count: number) => void;
}

let options: LayoutOptions | null = null;

/** Hands over the native module, pages and settings (and the pages to the Pro window). Call once after `app` is ready. */
export function setupLayouts(given: LayoutOptions): void {
  options = given;
  setupPro(given.preload, given.rendererUrl);
}

function need(): LayoutOptions {
  if (!options) throw new Error("setupLayouts was not called");
  return options;
}

// ---------------------------------------------------------------------------------------------
// Shapes

/** Each one arranges the windows of one monitor at once, the most recently used window in the first cell. */
export const SHAPES = ["Halves", "MainAndTwo", "Grid", "Auto"] as const;
export type LayoutShape = (typeof SHAPES)[number];

/** A cell as fractions of a screen (0…1, top-left based). */
interface Fraction { x: number; y: number; width: number; height: number }

/**
 * Cells of `shape`, first cell first. "Auto" is the shortcut's arrange (core/arrange.ts), so its
 * cells depend on how many windows the monitor has.
 */
export function shapeFractions(shape: LayoutShape, windowCount: number): Fraction[] {
  const cell = (x: number, y: number, width: number, height: number): Fraction => ({ x, y, width, height });
  switch (shape) {
    case "Halves":
      return [cell(0, 0, 0.5, 1), cell(0.5, 0, 0.5, 1)];
    case "Auto": {
      // Why: layoutRects rounds to whole points, so a big square keeps the fractions exact enough.
      const side = 1200;
      return layoutRects(windowCount, new Rect(0, 0, side, side)).map((r) => cell(r.x / side, r.y / side, r.width / side, r.height / side));
    }
    case "MainAndTwo":
      return [cell(0, 0, 0.6, 1), cell(0.6, 0, 0.4, 0.5), cell(0.6, 0.5, 0.4, 0.5)];
    case "Grid":
      return [cell(0, 0, 0.5, 0.5), cell(0.5, 0, 0.5, 0.5), cell(0, 0.5, 0.5, 0.5), cell(0.5, 0.5, 0.5, 0.5)];
  }
}

function contains(rect: NativeRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function middleOn(window: NativeWindow, frame: NativeRect): boolean {
  return contains(frame, window.rect.x + window.rect.width / 2, window.rect.y + window.rect.height / 2);
}

/** CGRectIntegral: the smallest whole-number rect that holds `rect`. */
function integral(rect: Rect): Rect {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  return new Rect(x, y, Math.ceil(rect.x + rect.width) - x, Math.ceil(rect.y + rect.height) - y);
}

/** Moves the windows and tells `moved` where they were, for one undo. Returns how many moved. */
function move(windows: NativeWindow[], rects: Rect[]): number {
  if (windows.length === 0) return 0;
  const { native, moved } = need();
  const moves = windows.map((w, i) => ({ id: w.id, rect: { x: rects[i].x, y: rects[i].y, width: rects[i].width, height: rects[i].height } }));
  try {
    native.apply(moves);
  } catch (error) {
    console.error("split: layout:", error);
    return 0;
  }
  moved(windows.map((w) => ({ id: w.id, rect: Rect.from(w.rect) })), windows.length);
  return windows.length;
}

function snapshot(withWindows: boolean): { screens: NativeScreen[]; windows: NativeWindow[] } | null {
  try {
    return need().native.snapshot(withWindows);
  } catch (error) {
    console.error("split: layout:", error);
    return null;
  }
}

/** Moves the visible windows of the monitor `displayId` into `shape`. Returns how many windows moved. */
export function applyShape(shape: LayoutShape, displayId: string): number {
  const shot = snapshot(true);
  const target = shot?.screens.find((s) => displayIdOf(s) === displayId);
  if (!shot || !target) return 0;
  const onScreen = shot.windows.filter((w) => middleOn(w, target.frame));
  const fractions = shapeFractions(shape, onScreen.length);
  const windows = onScreen.slice(0, fractions.length);
  const frame = Rect.from(target.workArea);
  // Why: the same gap as the shortcuts use (core/engine.ts), so a shape and a shortcut look alike.
  // macOS positions are in points already, so the gap needs no scaling there.
  const gap = need().gap() * (process.platform === "darwin" ? 1 : target.scale);
  const rects = windows.map((_w, i) => {
    const f = fractions[i];
    const cell = new Rect(frame.x + f.x * frame.width, frame.y + f.y * frame.height, f.width * frame.width, f.height * frame.height);
    return rectWithGap(integral(cell), frame, gap);
  });
  return move(windows, rects);
}

// ---------------------------------------------------------------------------------------------
// Monitors

/**
 * The id a layout remembers a monitor by. The macOS app used the display UUID; until the native
 * module gives it, Electron's display id (CGDirectDisplayID on macOS) is used, found by frame.
 */
function displayIdOf(nativeScreen: NativeScreen): string {
  if (nativeScreen.id) return nativeScreen.id;
  const f = nativeScreen.frame;
  const displays = screen.getAllDisplays();
  const same = displays.find((d) => d.bounds.x === Math.round(f.x) && d.bounds.y === Math.round(f.y) &&
    d.bounds.width === Math.round(f.width) && d.bounds.height === Math.round(f.height));
  const display = same ?? screen.getDisplayMatching({ x: Math.round(f.x), y: Math.round(f.y), width: Math.round(f.width), height: Math.round(f.height) });
  return String(display.id);
}

function displayNameOf(nativeScreen: NativeScreen): string {
  const f = nativeScreen.frame;
  const display = screen.getDisplayMatching({ x: Math.round(f.x), y: Math.round(f.y), width: Math.round(f.width), height: Math.round(f.height) });
  return display.label || t("LayoutDisplays");
}

/** Ids of the monitors connected now, sorted, as a layout saves them. */
export function currentDisplayIds(): string[] {
  const shot = snapshot(false);
  return shot ? shot.screens.map(displayIdOf).sort() : [];
}

function sameSet(a: readonly string[], b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

// ---------------------------------------------------------------------------------------------
// Saved layouts

/** A window remembered in a saved layout. Field names are the macOS app's Layouts.json keys. */
export interface SavedWindow {
  /** Bundle id of the app (macOS). */
  bundle: string;
  title: string;
  /** Which window of that app it was, front to back, for when titles changed. */
  index: number;
  /** x, y, width, height, top-left based. */
  rect: [number, number, number, number];
  display: string;
}

/** A named arrangement of every visible window, saved with the monitors it was made on. */
export interface SavedLayout {
  id: string;
  name: string;
  displays: string[];
  /** Put back by itself when exactly these monitors are connected again. */
  restoresForDisplays: boolean;
  windows: SavedWindow[];
}

let saved: SavedLayout[] | null = null;

function layoutsFile(): string {
  return join(app.getPath("userData"), "Layouts.json");
}

/** Keeps what LayoutFromDictionary in SplitLayouts.m keeps; anything unreadable is left out. */
function readLayout(input: unknown): SavedLayout | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.name !== "string") return null;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const windows: SavedWindow[] = [];
  for (const item of Array.isArray(raw.windows) ? raw.windows : []) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    const rect = w.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((n) => typeof n === "number")) continue;
    windows.push({
      bundle: text(w.bundle),
      title: text(w.title),
      index: typeof w.index === "number" && w.index >= 0 ? Math.floor(w.index) : 0,
      rect: rect as [number, number, number, number],
      display: text(w.display),
    });
  }
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : randomUUID().toUpperCase(),
    name: raw.name,
    displays: Array.isArray(raw.displays) ? raw.displays.filter((d): d is string => typeof d === "string") : [],
    restoresForDisplays: raw.restoresForDisplays === true || raw.restoresForDisplays === 1,
    windows,
  };
}

function load(): SavedLayout[] {
  if (saved) return saved;
  saved = [];
  const file = layoutsFile();
  if (!existsSync(file)) return saved;
  try {
    const items: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(items)) {
      for (const item of items) {
        const layout = readLayout(item);
        if (layout) saved.push(layout);
      }
    }
  } catch {
    // An unreadable file counts as no layouts; it is replaced on the next save.
  }
  return saved;
}

function write(): void {
  const file = layoutsFile();
  mkdirSync(dirname(file), { recursive: true });
  // Why: writing next to the file and renaming means a crash mid-write never leaves half a file.
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(load(), null, 2)}\n`);
  renameSync(temp, file);
}

/** Saved layouts, oldest first, as the menu shows them. */
export function layouts(): readonly SavedLayout[] {
  return load();
}

/** The app a saved window belongs to, and its title. */
function appOf(window: NativeWindow): string {
  return window.bundle || window.app;
}

/**
 * Records where every visible window is now. With `restoresForDisplays`, any other layout that
 * restores for the same monitors stops doing so, so only one answers each combination.
 * Null when the windows could not be read.
 */
export function saveCurrentLayout(name: string, restoresForDisplays: boolean): SavedLayout | null {
  const shot = snapshot(true);
  if (!shot) return null;
  const countByApp = new Map<string, number>();
  const windows: SavedWindow[] = [];
  for (const window of shot.windows) {
    const on = shot.screens.find((s) => middleOn(window, s.frame));
    if (!on) continue;
    const bundle = appOf(window);
    const index = countByApp.get(bundle) ?? 0;
    countByApp.set(bundle, index + 1);
    const r = window.rect;
    windows.push({ bundle, title: window.title ?? "", index, rect: [r.x, r.y, r.width, r.height], display: displayIdOf(on) });
  }
  const layout: SavedLayout = {
    id: randomUUID().toUpperCase(),
    name,
    displays: shot.screens.map(displayIdOf).sort(),
    restoresForDisplays,
    windows,
  };
  const list = load();
  if (restoresForDisplays) {
    for (const other of list) {
      if (sameSet(other.displays, layout.displays)) other.restoresForDisplays = false;
    }
  }
  list.push(layout);
  write();
  return layout;
}

export function removeLayout(id: string): void {
  const list = load();
  const index = list.findIndex((layout) => layout.id === id);
  if (index < 0) return;
  list.splice(index, 1);
  write();
}

/** The layout to put back by itself when exactly `displayIds` are connected, or null. */
export function layoutRestoringForDisplays(displayIds: Iterable<string>): SavedLayout | null {
  const ids = [...displayIds];
  return load().find((layout) => layout.restoresForDisplays && sameSet(layout.displays, ids)) ?? null;
}

/**
 * Moves every window that is open now back to where `layout` had it, matching by app and title,
 * then by order within the app. Windows on monitors that are not connected stay.
 * Returns how many windows moved.
 */
export function restoreLayout(layout: SavedLayout): number {
  const shot = snapshot(true);
  if (!shot) return 0;
  const connected = new Set(shot.screens.map(displayIdOf));
  const windows = shot.windows;
  const countByApp = new Map<string, number>();
  const indexes = windows.map((window) => {
    const bundle = appOf(window);
    const index = countByApp.get(bundle) ?? 0;
    countByApp.set(bundle, index + 1);
    return index;
  });
  // Why: until the native module gives bundle ids, a window is known by its app name; layouts the
  // macOS app saved hold bundle ids, so either one counts as the same app.
  const sameApp = (window: NativeWindow, savedWindow: SavedWindow) =>
    savedWindow.bundle === appOf(window) || savedWindow.bundle === window.app;
  const used = new Set<number>();
  const placed = new Set<number>();
  const moved: NativeWindow[] = [];
  const rects: Rect[] = [];
  // Two passes: same app and same title first, then same app and same place in its order.
  for (const pass of [0, 1]) {
    layout.windows.forEach((savedWindow, savedIndex) => {
      if (placed.has(savedIndex) || !connected.has(savedWindow.display)) return;
      const index = windows.findIndex((window, i) => {
        if (used.has(i) || !sameApp(window, savedWindow)) return false;
        return pass === 0
          ? savedWindow.title.length > 0 && (window.title ?? "") === savedWindow.title
          : indexes[i] === savedWindow.index;
      });
      if (index < 0) return;
      used.add(index);
      placed.add(savedIndex);
      moved.push(windows[index]);
      const [x, y, width, height] = savedWindow.rect;
      rects.push(new Rect(x, y, width, height));
    });
  }
  return move(moved, rects);
}

// ---------------------------------------------------------------------------------------------
// Menu pictures

/**
 * A small screen with `fractions` filled in (or only outlined), as a template image (macOS tints
 * it), 22 × 16 points like the other menu pictures. Port of SplitMiniScreenImage.
 */
function miniScreen(fractions: Fraction[], outlined = false): Electron.NativeImage {
  const scale = 2;
  const width = 22 * scale;
  const height = 16 * scale;
  const buffer = Buffer.alloc(width * height * 4);
  // Distance from (px, py) to the edge of a rounded rect, negative inside.
  const distance = (px: number, py: number, x: number, y: number, w: number, h: number, r: number) => {
    const dx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
    const dy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  };
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  // In points: the screen is 22 × 15 centred in the 16-point row, as SplitWindowFeedback draws it.
  const sx = 0.75;
  const sy = 1.25;
  const sw = 22 - 1.5;
  const sh = 15 - 1.5;
  const inner = { x: sx + 2, y: sy + 2, width: sw - 4, height: sh - 4 };
  const inset = fractions.length > 1 ? 0.6 : 0.4;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const px = (column + 0.5) / scale;
      const py = (row + 0.5) / scale;
      const edge = distance(px, py, sx, sy, sw, sh, 2.5);
      let alpha = clamp((1.3 / 2 - Math.abs(edge)) * scale + 0.5) * 0.55;
      for (const f of fractions) {
        const x = inner.x + f.x * inner.width + inset;
        const y = inner.y + f.y * inner.height + inset;
        const w = f.width * inner.width - 2 * inset;
        const h = f.height * inner.height - 2 * inset;
        if (w <= 0 || h <= 0) continue;
        const cellEdge = distance(px, py, x, y, w, h, Math.min(1.2, w / 2, h / 2));
        alpha = Math.max(alpha, outlined ? clamp((1 / 2 - Math.abs(cellEdge)) * scale + 0.5) : clamp(0.5 - cellEdge * scale));
      }
      const i = (row * width + column) * 4;
      buffer[i + 3] = Math.round(alpha * 255);
    }
  }
  const image = nativeImage.createFromBitmap(buffer, { width, height, scaleFactor: scale });
  image.setTemplateImage(true);
  return image;
}

/** The windows of a saved layout as cells of one small screen: the monitor holding most of them. */
function layoutFractions(layout: SavedLayout, screens: NativeScreen[]): Fraction[] {
  const counts = new Map<string, number>();
  for (const window of layout.windows) counts.set(window.display, (counts.get(window.display) ?? 0) + 1);
  let busiest: string | null = null;
  for (const [id, count] of counts) {
    if (busiest === null || count > (counts.get(busiest) ?? 0)) busiest = id;
  }
  const on = screens.find((s) => displayIdOf(s) === busiest);
  const fractions: Fraction[] = [];
  if (on && on.workArea.width > 0 && on.workArea.height > 0) {
    const frame = Rect.from(on.workArea);
    for (const window of layout.windows) {
      if (window.display !== busiest) continue;
      const [x, y, width, height] = window.rect;
      const left = Math.max(x, frame.x);
      const top = Math.max(y, frame.y);
      const right = Math.min(x + width, frame.maxX());
      const bottom = Math.min(y + height, frame.maxY());
      if (right <= left || bottom <= top) continue;
      fractions.push({
        x: (left - frame.x) / frame.width,
        y: (top - frame.y) / frame.height,
        width: (right - left) / frame.width,
        height: (bottom - top) / frame.height,
      });
    }
  }
  return fractions;
}

// ---------------------------------------------------------------------------------------------
// Tray menu

/** Runs `run` a moment after the menu closed, so the windows move once the menu is gone. */
function afterMenuCloses(run: () => void): void {
  setTimeout(run, 150);
}

function shapeItems(displayId: string, windowCount: number): MenuItemConstructorOptions[] {
  return SHAPES.map((shape) => ({
    label: t(`LayoutShape${shape}`),
    // Why: "Auto" is drawn as outlines so it never looks the same as the fixed shape it matches.
    icon: shape === "Auto" ? miniScreen(shapeFractions(shape, autoPreviewCount(windowCount)), true) : miniScreen(shapeFractions(shape, windowCount)),
    click: () => afterMenuCloses(() => applyShape(shape, displayId)),
  }));
}

/** What the macOS panel (native/mac/menu.m) draws: monitor rows, shape chips and saved layouts. */
export interface LayoutPanel {
  card: unknown;
  /** Runs what a chip stands for, given the id the panel returned. */
  choose: (chosen: string) => void;
}

/** Stands in the template for the macOS panel; macMenu.ts puts the panel there. */
export const LAYOUT_PANEL_ID = "split-layout-panel";

/**
 * The "Layouts" section of the tray menu, ending in a separator. Build it each time the menu
 * opens, so the monitors, window counts and saved layouts are current. `onChange` runs after a
 * layout was saved or removed.
 *
 * With `panel` (macOS), the monitors, shapes and saved layouts are one item that macMenu.ts
 * replaces with the panel the macOS app had, and `layoutPanel` describes it. A plain menu cannot
 * hold that panel, so elsewhere with one monitor the shapes are items here, and with more each
 * monitor is a submenu of shapes, in place of choosing a monitor row first.
 */
export function layoutMenuItems(onChange: () => void, panel = false): MenuItemConstructorOptions[] {
  const shot = snapshot(true);
  const screens = shot?.screens ?? [];
  const items: MenuItemConstructorOptions[] = [{ label: t("LayoutSection"), enabled: false }];
  const list = layouts();

  if (panel) {
    items.push({ id: LAYOUT_PANEL_ID, label: "" });
  } else {
    if (screens.length === 1) {
      items.push(...shapeItems(displayIdOf(screens[0]), windowCount(shot?.windows ?? [], screens[0])));
    } else {
      for (const nativeScreen of screens) {
        const count = windowCount(shot?.windows ?? [], nativeScreen);
        items.push({
          label: displayNameOf(nativeScreen),
          sublabel: screenDetail(nativeScreen, count),
          icon: monitorIcon(),
          submenu: shapeItems(displayIdOf(nativeScreen), count),
        });
      }
    }

    items.push({ type: "separator" }, { label: t("LayoutSaved"), enabled: false });
    if (list.length === 0) {
      items.push({ label: t("LayoutSavedEmpty"), enabled: false });
    } else {
      for (const layout of list) {
        items.push({
          label: savedLabel(layout),
          icon: miniScreen(layoutFractions(layout, screens)),
          ...(layout.restoresForDisplays ? { toolTip: t("LayoutSaveAuto") } : {}),
          click: () => afterMenuCloses(() => restoreLayout(layout)),
        });
      }
    }
  }

  items.push({
    label: t("LayoutSave"),
    icon: menuPicture("save"),
    // Why: wait for the menu to close, or the window opens behind it.
    click: () => afterMenuCloses(() => void askToSaveLayout().then((layout) => layout && onChange())),
  });
  if (list.length > 0) {
    items.push({
      label: t("LayoutDelete"),
      icon: menuPicture("delete"),
      submenu: list.map((layout) => ({
        label: layout.name,
        click: () => {
          removeLayout(layout.id);
          onChange();
        },
      })),
    });
  }
  items.push({ type: "separator" });
  return items;
}

/** The macOS panel for the item `layoutMenuItems(…, true)` left in its place. */
export function layoutPanel(): LayoutPanel {
  const shot = snapshot(true);
  const screens = shot?.screens ?? [];
  const list = layouts();
  const cells = (fractions: Fraction[]) => fractions.map((f) => [f.x, f.y, f.width, f.height]);
  // The monitor under the mouse is picked first, as in the macOS app.
  const cursor = screen.getCursorScreenPoint();
  const underMouse = screens.find((s) => contains(s.frame, cursor.x, cursor.y)) ?? screens.find((s) => s.primary) ?? screens[0];
  const picture = (name: string) => menuPicture(name).toPNG({ scaleFactor: 2 }).toString("base64");
  const card = {
    titles: { displays: t("LayoutDisplays"), shapes: t("LayoutShapes"), saved: t("LayoutSaved") },
    empty: t("LayoutSavedEmpty"),
    monitorImage: picture("monitor"),
    checkImage: picture("check"),
    selected: underMouse ? displayIdOf(underMouse) : "",
    screens: screens.map((nativeScreen) => {
      const count = windowCount(shot?.windows ?? [], nativeScreen);
      return {
        id: displayIdOf(nativeScreen),
        name: displayNameOf(nativeScreen),
        detail: screenDetail(nativeScreen, count),
        auto: cells(shapeFractions("Auto", autoPreviewCount(count))),
      };
    }),
    shapes: SHAPES.map((shape) => ({
      id: `shape:${shape}`,
      label: t(`LayoutShape${shape}`),
      ...(shape === "Auto" ? { auto: true } : { cells: cells(shapeFractions(shape, 0)) }),
    })),
    saved: list.map((layout) => ({
      id: `saved:${layout.id}`,
      label: savedLabel(layout),
      cells: cells(layoutFractions(layout, screens)),
      ...(layout.restoresForDisplays ? { toolTip: t("LayoutSaveAuto") } : {}),
    })),
  };
  const choose = (chosen: string) => {
    // A shape comes back as "shape:<name>\t<monitor>", a saved layout as "saved:<id>".
    const [what, displayId] = chosen.split("\t");
    if (what.startsWith("shape:")) {
      const shape = what.slice("shape:".length) as LayoutShape;
      if (SHAPES.includes(shape) && displayId) afterMenuCloses(() => applyShape(shape, displayId));
    } else if (what.startsWith("saved:")) {
      const layout = layouts().find((l) => l.id === what.slice("saved:".length));
      if (layout) afterMenuCloses(() => restoreLayout(layout));
    }
  };
  return { card, choose };
}

/**
 * How many windows the "Auto" picture shows: the windows on the monitor, or six on an empty one,
 * whose picture would otherwise be a blank screen that looks broken.
 */
function autoPreviewCount(count: number): number {
  return count > 0 ? count : 6;
}

function windowCount(windows: NativeWindow[], nativeScreen: NativeScreen): number {
  return windows.filter((w) => middleOn(w, nativeScreen.frame)).length;
}

/** "5120 × 2880 · 3 windows": pixels, as the monitor's own spec says, then the windows on it. */
function screenDetail(nativeScreen: NativeScreen, count: number): string {
  const pixels = `${Math.round(nativeScreen.frame.width * nativeScreen.scale)} × ${Math.round(nativeScreen.frame.height * nativeScreen.scale)}`;
  return `${pixels} · ${t("LayoutWindowCount", count)}`;
}

/** " ·A" marks the one that comes back by itself, as the macOS chip did. */
function savedLabel(layout: SavedLayout): string {
  return layout.restoresForDisplays ? `${layout.name} ·A` : layout.name;
}

function resourcePath(...parts: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...parts) : join(app.getAppPath(), "resources", ...parts);
}

function menuPicture(name: string): Electron.NativeImage {
  return nativeImage.createFromPath(resourcePath("menu", `${name}Template.png`));
}

function monitorIcon(): Electron.NativeImage {
  return menuPicture("monitor");
}

// ---------------------------------------------------------------------------------------------
// The "Save Current Layout" window

let saveWindow: BrowserWindow | null = null;
let answerSave: ((answer: LayoutSaveAnswer) => void) | null = null;

/**
 * Asks for a name (and whether it comes back by itself for these monitors), then saves the
 * layout. Resolves with the saved layout, or null for Cancel. A second call while the window is
 * open only brings it forward. Same look and sizing as the update window (overlay.ts askToInstall).
 */
export function askToSaveLayout(): Promise<SavedLayout | null> {
  if (isMac) app.focus({ steal: true });
  if (saveWindow && !saveWindow.isDestroyed()) {
    saveWindow.show();
    saveWindow.focus();
    return Promise.resolve(null);
  }
  const { preload, rendererUrl } = need();
  const defaultName = t("LayoutSaveDefaultName", layouts().length + 1);
  const payload: LayoutSavePayload = {
    kind: "save",
    title: t("LayoutSaveTitle"),
    message: t("LayoutSaveMessage"),
    defaultName,
    placeholder: t("LayoutSaveNamePlaceholder"),
    auto: t("LayoutSaveAuto"),
    save: t("LayoutSaveButton"),
    cancel: t("LayoutSaveCancel"),
  };
  const width = 400;
  const window = new BrowserWindow({
    width,
    height: 300,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: payload.title,
    ...(isMac ? { titleBarStyle: "hidden" as const } : {}),
    webPreferences: { preload, contextIsolation: true, sandbox: true },
  });
  saveWindow = window;
  return new Promise((resolve) => {
    answerSave = (answer) => {
      answerSave = null;
      let layout: SavedLayout | null = null;
      if (answer) {
        const name = answer.name.trim() || defaultName;
        layout = saveCurrentLayout(name, answer.restoresForDisplays);
      }
      resolve(layout);
      if (!window.isDestroyed()) window.close();
    };
    window.on("closed", () => {
      if (saveWindow === window) saveWindow = null;
      answerSave?.(null);
    });
    window.webContents.once("did-finish-load", () => {
      const measure = "Math.ceil(document.documentElement.scrollHeight)";
      void window.webContents
        .executeJavaScript(measure)
        .then((height: unknown) => {
          if (!window.isDestroyed() && typeof height === "number" && height > 0) window.setContentSize(width, height);
        })
        .catch(() => undefined)
        .finally(() => {
          if (window.isDestroyed()) return;
          window.center();
          window.show();
          window.focus();
        });
    });
    void window.loadURL(`${rendererUrl("layout.html")}#${encodeURIComponent(JSON.stringify(payload))}`);
  });
}

ipcMain.handle("layout:answer", (_event, answer: LayoutSaveAnswer) => {
  const valid = answer && typeof answer === "object" && typeof answer.name === "string"
    ? { name: answer.name, restoresForDisplays: answer.restoresForDisplays === true }
    : null;
  answerSave?.(valid);
});
