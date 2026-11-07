// What to do with the windows when monitors are plugged in or out. Port of the calculation in
// `SplitDisplayChangeArranger` (`SplitWindowArranger.m`); the timers and screen
// events live in `src/main/displays.ts`.
//
// - Windows from a monitor that went away move to the monitors left, which are re-arranged.
// - Windows that used to be on a monitor that came back go back to their old place.
// - A monitor never seen before gets a share of the windows by screen area, the most recently
//   used windows going to the main monitor, and every monitor is re-arranged.

import { layoutRects, MAXIMUM_WINDOW_COUNT } from "./arrange.ts";
import type { Move, Screen, WindowInfo } from "./engine.ts";
import { type Rect, rectWithGap } from "./geometry.ts";

/** A monitor with something that names it again after it is unplugged and plugged back in. */
export interface DisplayScreen extends Screen {
  id: string;
}

/** Where a window was last seen. */
export interface WindowPlace {
  displayId: string;
  rect: Rect;
}

export function sameDisplayIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** The screen holding the middle of `rect`, as `SplitScreenContainingPoint` does. */
function screenAtMiddle(rect: Rect, screens: readonly DisplayScreen[]): DisplayScreen | null {
  return screens.find((s) => s.frame.containsPoint(rect.midX(), rect.midY())) ?? null;
}

/**
 * Which monitor and where each window is now. Only windows on screen now are kept, so closed
 * windows are let go.
 */
export function recordPlaces(windows: readonly WindowInfo[], screens: readonly DisplayScreen[]): Map<number, WindowPlace> {
  const places = new Map<number, WindowPlace>();
  for (const window of windows) {
    const screen = screenAtMiddle(window.rect, screens);
    if (screen === null) {
      continue;
    }
    places.set(window.id, { displayId: screen.id, rect: window.rect });
  }
  return places;
}

/** Main screen first, then bigger screens first. */
export function screensInAreaOrder(screens: readonly DisplayScreen[]): DisplayScreen[] {
  // Why: `sort` keeps equal screens in their old order, which is how macOS lists them.
  return screens.slice().sort((a, b) => Number(b.primary) - Number(a.primary) || b.workArea.area() - a.workArea.area());
}

/** How many of `count` windows each screen gets, in proportion to its area, at most 9 each. */
export function sharesByArea(screens: readonly DisplayScreen[], count: number): number[] {
  const total = screens.reduce((sum, s) => sum + s.workArea.area(), 0);
  const shares = screens.map((s) => (total > 0 ? Math.floor((count * s.workArea.area()) / total) : 0));
  let given = shares.reduce((sum, share) => sum + share, 0);
  // Rounding leftovers go to the screens in order (main first).
  for (let index = 0; given < count && shares.length > 0; index = (index + 1) % shares.length) {
    shares[index]! += 1;
    given += 1;
  }
  return shares.map((share) => Math.min(share, MAXIMUM_WINDOW_COUNT));
}

/** The auto-arrange layout of `windows` (front to back) on `screen`. */
function layoutOn(windows: readonly WindowInfo[], screen: DisplayScreen, gap: number): Move[] {
  const frame = screen.workArea;
  const pixels = gap * screen.scale;
  return layoutRects(windows.length, frame).map((rect, i) => ({ id: windows[i]!.id, rect: rectWithGap(rect, frame, pixels).rounded() }));
}

export interface DisplayChange {
  /** Monitor ids before the change. */
  oldIds: ReadonlySet<string>;
  /** Monitor ids now; must differ from `oldIds`. */
  newIds: ReadonlySet<string>;
  /** Every monitor seen since Split started, before this change. */
  seenIds: ReadonlySet<string>;
  /** Where each window was at the last record, before the change. */
  places: ReadonlyMap<number, WindowPlace>;
  /**
   * Where windows were before their monitor went away. Kept apart from `places`, which keeps
   * being updated while the windows sit on another screen, so they can go home later.
   */
  awayPlaces: ReadonlyMap<number, WindowPlace>;
  /** Ordinary visible windows now, front to back. */
  windows: readonly WindowInfo[];
  /** The monitors now. */
  screens: readonly DisplayScreen[];
  /** Space between windows in points, as for auto-arrange. */
  gap: number;
}

export interface DisplayChangePlan {
  /** Where windows go. Can be empty when a new monitor came but there were no windows. */
  moves: Move[];
  /** Where those windows were before, so one undo puts all of them back. */
  previous: Move[];
  /** Whether the windows only went back to remembered places. */
  restored: boolean;
}

export interface DisplayChangeResult {
  /** Null when nothing has to move. */
  plan: DisplayChangePlan | null;
  seenIds: Set<string>;
  awayPlaces: Map<number, WindowPlace>;
}

/** Where the windows go after monitors were plugged in or out. */
export function planDisplayChange(change: DisplayChange): DisplayChangeResult {
  const { oldIds, newIds, windows, gap } = change;
  const removed = new Set([...oldIds].filter((id) => !newIds.has(id)));
  const added = new Set([...newIds].filter((id) => !oldIds.has(id)));
  const neverSeen = [...added].filter((id) => !change.seenIds.has(id));
  const seenIds = new Set([...change.seenIds, ...newIds]);
  const awayPlaces = new Map(change.awayPlaces);
  const screens = screensInAreaOrder(change.screens);
  const before = new Map(windows.map((w) => [w.id, w.rect]));
  const finish = (moves: Move[], restored: boolean): DisplayChangeResult => ({
    plan: { moves, previous: moves.map((m) => ({ id: m.id, rect: before.get(m.id)! })), restored },
    seenIds,
    awayPlaces,
  });

  if (neverSeen.length > 0) {
    // A new monitor: share every window out by screen area and arrange each screen.
    const shares = sharesByArea(screens, windows.length);
    const moves: Move[] = [];
    let next = 0;
    screens.forEach((screen, index) => {
      const share = Math.min(shares[index]!, windows.length - next);
      moves.push(...layoutOn(windows.slice(next, next + share), screen, gap));
      next += share;
    });
    return finish(moves, false);
  }

  // Windows whose monitor came back go home; windows whose monitor left need a new screen.
  const moves: Move[] = [];
  const homeless: WindowInfo[] = [];
  const stayingByDisplay = new Map<string, Set<number>>();
  for (const window of windows) {
    const place = change.places.get(window.id);
    const home = awayPlaces.get(window.id);
    if (home !== undefined && added.has(home.displayId)) {
      moves.push({ id: window.id, rect: home.rect });
      awayPlaces.delete(window.id);
    } else if (place !== undefined && removed.has(place.displayId)) {
      homeless.push(window);
      if (home === undefined) {
        awayPlaces.set(window.id, place);
      }
    } else {
      const displayId = screenAtMiddle(window.rect, change.screens)?.id ?? "";
      let staying = stayingByDisplay.get(displayId);
      if (staying === undefined) {
        staying = new Set();
        stayingByDisplay.set(displayId, staying);
      }
      staying.add(window.id);
    }
  }
  const restored = moves.length > 0 && homeless.length === 0;
  if (homeless.length > 0) {
    // Share the windows from the monitor that left out by area, then arrange each screen that
    // received some together with the windows already on it, front to back.
    const shares = sharesByArea(screens, homeless.length);
    let next = 0;
    screens.forEach((screen, index) => {
      const share = Math.min(shares[index]!, homeless.length - next);
      if (share === 0) {
        return;
      }
      const incoming = new Set(homeless.slice(next, next + share).map((w) => w.id));
      next += share;
      const staying = stayingByDisplay.get(screen.id) ?? new Set<number>();
      const together = windows.filter((w) => incoming.has(w.id) || staying.has(w.id)).slice(0, MAXIMUM_WINDOW_COUNT);
      moves.push(...layoutOn(together, screen, gap));
    });
  }
  if (moves.length === 0) {
    return { plan: null, seenIds, awayPlaces };
  }
  return finish(moves, restored);
}
