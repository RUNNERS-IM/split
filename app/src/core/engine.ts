// Turns "this shortcut was pressed, and this is what is on screen" into "move these windows
// here". Port of `SplitWindowPositionManager.m`, `SplitScreenDetector.m`, `SplitHistory.m`
// and the arrange part of `SplitWindowArranger.m`.

import { Action, movesToDisplay, usesGap } from "./actions.ts";
import { layoutRects, MAXIMUM_WINDOW_COUNT, MINIMUM_WINDOW_SIDE } from "./arrange.ts";
import { calculate } from "./calc.ts";
import { type Rect, rectWithGap, roughlyEqual } from "./geometry.ts";

/** One monitor. Both rects are top-left based in the coordinates the platform moves windows in. */
export interface Screen {
  /** The whole monitor. */
  frame: Rect;
  /** The monitor without taskbars, panels and docks. */
  workArea: Rect;
  /** Pixels per point, so gaps look the same on high-density screens. 1 when unknown. */
  scale: number;
  /** The main monitor; it comes first when monitors are put in order. */
  primary: boolean;
}

export interface WindowInfo {
  /** Whatever the platform uses to find the window again (HWND, X11 window id, …). */
  id: number;
  /** Where the visible frame of the window is, without invisible borders or shadows. */
  rect: Rect;
  /** Which app owns it; undo and redo keep one history per app, as on macOS. */
  app: string;
}

/** What is on screen when a shortcut is pressed. */
export interface Snapshot {
  /** The window that has the keyboard focus. */
  active: WindowInfo | null;
  screens: Screen[];
  /** Ordinary visible windows on the current desktop, front to back. Only needed for arrange. */
  windows: WindowInfo[];
}

export interface Move {
  readonly id: number;
  readonly rect: Rect;
}

/** What to tell the user afterwards. */
export type Feedback =
  /** Nothing could move (no window, already there, only one monitor…). macOS beeps. */
  | { kind: "Failed" }
  | { kind: "Moved" }
  | { kind: "Arranged"; count: number }
  | { kind: "NothingToArrange" }
  | { kind: "ArrangeUndone" };

export interface Outcome {
  moves: Move[];
  feedback: Feedback;
}

function failed(): Outcome {
  return { moves: [], feedback: { kind: "Failed" } };
}

/**
 * Undo history of one app, at most 50 places. Same behaviour as `SplitHistory.m`: adding a
 * place after an undo drops the places that redo would have gone to.
 */
class History {
  items: Move[] = [];
  current = 0;

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  add(item: Move): void {
    if (this.items.length !== 0) {
      this.items.length = Math.min(this.items.length, this.current + 1);
    }
    this.items.push(item);
    if (this.items.length > HISTORY_LIMIT) {
      this.items.shift();
    }
    this.current = this.items.length - 1;
  }

  previous(): Move | null {
    if (this.items.length === 0 || this.current === 0) {
      return null;
    }
    this.current -= 1;
    return this.items[this.current] ?? null;
  }

  next(): Move | null {
    if (this.current + 1 >= this.items.length) {
      return null;
    }
    this.current += 1;
    return this.items[this.current] ?? null;
  }
}

const HISTORY_LIMIT = 50;

function totalCmp(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  if (a === b) {
    return Number(Object.is(b, -0)) - Number(Object.is(a, -0));
  }
  return Number(Number.isNaN(a)) - Number(Number.isNaN(b));
}

/**
 * Screens in the order macOS uses for next and previous display: the main monitor first, then
 * the others from top to bottom and, after that, from right to left.
 * Port of `screensInConsistentOrder:` in `SplitScreenDetector.m`.
 */
export function screensInConsistentOrder(screens: readonly Screen[]): Screen[] {
  const ordered = screens.slice();
  const primaryFirst = (a: Screen, b: Screen): number => Number(b.primary) - Number(a.primary);
  ordered.sort((a, b) => primaryFirst(a, b) || totalCmp(a.frame.maxY(), b.frame.maxY()));
  ordered.sort((a, b) => primaryFirst(a, b) || totalCmp(b.frame.x, a.frame.x));
  return ordered;
}

/** The screen holding all of `rect`, else the one holding most of it, else the main one. */
export function screenContaining(rect: Rect, screens: readonly Screen[]): Screen | null {
  const main = screens.find((s) => s.primary) ?? screens[0] ?? null;
  let best = main;
  let bestShare = 0.0;
  for (const screen of screens) {
    if (screen.frame.containsRect(rect)) {
      return screen;
    }
    const i = screen.frame.intersection(rect);
    const share = i === null ? 0.0 : i.area() / Math.max(rect.area(), 1.0);
    if (share > bestShare) {
      bestShare = share;
      best = screen;
    }
  }
  return best;
}

function neighbourScreen(source: Screen, action: Action, ordered: readonly Screen[]): Screen | null {
  if (ordered.length <= 1) {
    return null;
  }
  const index = ordered.findIndex((s) => s.frame.equals(source.frame));
  if (index === -1) {
    return null;
  }
  const count = ordered.length;
  let next: number;
  switch (action) {
    case Action.MoveToNextDisplay:
      next = (index + 1) % count;
      break;
    case Action.MoveToPreviousDisplay:
      next = (index + count - 1) % count;
      break;
    default:
      next = index;
  }
  return ordered[next] ?? null;
}

export class Engine {
  private readonly histories = new Map<string, History>();
  /** Window → (rect before full screen, full screen rect), so pressing full screen again restores it. */
  private readonly fullscreenRestore = new Map<number, [Rect, Rect]>();
  /**
   * Window → (rect with the gap, the same rect without it). Halves and thirds cycle by
   * comparing the window with exact fractions of the screen, so the calculation is given
   * the rect without the gap.
   */
  private readonly gapless = new Map<number, [Rect, Rect]>();
  /** Where each window of the last auto-arrange was before, so one undo puts all of them back. */
  private lastArrangement: Move[] = [];

  private history(app: string): History {
    let history = this.histories.get(app);
    if (history === undefined) {
      history = new History();
      this.histories.set(app, history);
    }
    return history;
  }

  /**
   * Where the windows go for `action`. `gap` is the space between windows in points; each
   * screen's `scale` turns it into pixels.
   */
  plan(action: Action, snapshot: Snapshot, gap: number): Outcome {
    if (action === Action.ArrangeWindows) {
      return this.arrange(snapshot, gap);
    }
    if (action === Action.UndoLastMove && this.lastArrangement.length !== 0) {
      const moves = this.lastArrangement;
      this.lastArrangement = [];
      return { moves, feedback: { kind: "ArrangeUndone" } };
    }
    if (action === Action.UndoLastMove || action === Action.RedoLastMove) {
      this.lastArrangement = [];
      const active = snapshot.active;
      if (active === null) {
        return failed();
      }
      const history = this.history(active.app);
      const item = action === Action.UndoLastMove ? history.previous() : history.next();
      if (item !== null) {
        return { moves: [item], feedback: { kind: "Moved" } };
      }
      return failed();
    }
    this.lastArrangement = [];
    return this.moveActive(action, snapshot, gap);
  }

  private moveActive(action: Action, snapshot: Snapshot, gap: number): Outcome {
    const active = snapshot.active;
    if (active === null) {
      return failed();
    }
    if (active.rect.isEmpty()) {
      return failed();
    }
    const ordered = screensInConsistentOrder(snapshot.screens);
    const source = screenContaining(active.rect, ordered);
    if (source === null) {
      return failed();
    }
    let destination: Screen;
    if (movesToDisplay(action)) {
      const screen = neighbourScreen(source, action, ordered);
      if (screen === null) {
        return failed();
      }
      destination = screen;
    } else {
      destination = source;
    }

    const history = this.history(active.app);
    if (history.isEmpty()) {
      history.add({ id: active.id, rect: active.rect });
    }

    const restore = this.fullscreenRestore.get(active.id);
    this.fullscreenRestore.delete(active.id);
    if (action === Action.MoveToFullscreen) {
      if (restore !== undefined) {
        const [before, fullscreen] = restore;
        if (roughlyEqual(active.rect, fullscreen)) {
          const item: Move = { id: active.id, rect: before };
          history.add(item);
          return { moves: [item], feedback: { kind: "Moved" } };
        }
      }
    }

    let windowRect = active.rect;
    const gapless = this.gapless.get(active.id);
    this.gapless.delete(active.id);
    if (gapless !== undefined) {
      const [withGap, withoutGap] = gapless;
      if (roughlyEqual(windowRect, withGap)) {
        windowRect = withoutGap;
      }
    }

    let target: Rect | null;
    try {
      target = calculate(action, windowRect, source.workArea, destination.workArea);
    } catch {
      return failed();
    }
    if (target === null) {
      return failed();
    }
    if (target.equals(windowRect)) {
      return failed();
    }
    const pixels = gap * destination.scale;
    if (pixels > 0.0 && usesGap(action)) {
      const withoutGap = target;
      target = rectWithGap(target, destination.workArea, pixels);
      this.gapless.set(active.id, [target, withoutGap]);
    }
    target = target.rounded();
    const item: Move = { id: active.id, rect: target };
    history.add(item);
    if (action === Action.MoveToFullscreen) {
      this.fullscreenRestore.set(active.id, [active.rect, target]);
    }
    return { moves: [item], feedback: { kind: "Moved" } };
  }

  /**
   * Remembers where windows were before something other than a shortcut moved them, so one
   * undo puts all of them back. Port of `moveWindows:toRects:` (used when monitors change).
   */
  rememberArrangement(previous: readonly Move[]): void {
    this.lastArrangement = previous.slice();
  }

  private arrange(snapshot: Snapshot, gap: number): Outcome {
    const ordered = screensInConsistentOrder(snapshot.screens);
    const main = ordered[0] ?? null;
    // The screen that holds the middle of the active window, or the main one.
    const active = snapshot.active;
    const screen =
      (active !== null ? ordered.find((s) => s.frame.containsPoint(active.rect.midX(), active.rect.midY())) : undefined) ??
      main;
    if (screen === null) {
      return { moves: [], feedback: { kind: "NothingToArrange" } };
    }
    const windows = snapshot.windows
      .filter((w) => w.rect.width >= MINIMUM_WINDOW_SIDE && w.rect.height >= MINIMUM_WINDOW_SIDE)
      .filter((w) => screen.frame.containsPoint(w.rect.midX(), w.rect.midY()))
      .slice(0, MAXIMUM_WINDOW_COUNT);
    if (windows.length === 0) {
      return { moves: [], feedback: { kind: "NothingToArrange" } };
    }
    const frame = screen.workArea;
    const pixels = gap * screen.scale;
    const moves: Move[] = layoutRects(windows.length, frame)
      .slice(0, windows.length)
      .map((rect, i) => ({ id: windows[i]!.id, rect: rectWithGap(rect, frame, pixels).rounded() }));
    this.lastArrangement = windows.map((w) => ({ id: w.id, rect: w.rect }));
    const count = moves.length;
    return { moves, feedback: { kind: "Arranged", count } };
  }
}
