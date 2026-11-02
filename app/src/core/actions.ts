// The window actions. Names match the macOS app: `name()` is the shortcut name and the
// translation key, `jsName()` is the action the JavaScript calculations register under.

export const Action = {
  MoveToCenter: "MoveToCenter",
  MoveToFullscreen: "MoveToFullscreen",
  MoveToLeftHalf: "MoveToLeftHalf",
  MoveToRightHalf: "MoveToRightHalf",
  MoveToTopHalf: "MoveToTopHalf",
  MoveToBottomHalf: "MoveToBottomHalf",
  MoveToUpperLeft: "MoveToUpperLeft",
  MoveToLowerLeft: "MoveToLowerLeft",
  MoveToUpperRight: "MoveToUpperRight",
  MoveToLowerRight: "MoveToLowerRight",
  MoveToNextDisplay: "MoveToNextDisplay",
  MoveToPreviousDisplay: "MoveToPreviousDisplay",
  MoveToNextThird: "MoveToNextThird",
  MoveToPreviousThird: "MoveToPreviousThird",
  MakeLarger: "MakeLarger",
  MakeSmaller: "MakeSmaller",
  UndoLastMove: "UndoLastMove",
  RedoLastMove: "RedoLastMove",
  ArrangeWindows: "ArrangeWindows",
} as const;

export type Action = (typeof Action)[keyof typeof Action];

/** Settings and menu sections, in the order the macOS settings window shows them. */
export const SECTIONS: readonly (readonly [string, readonly Action[]])[] = [
  ["SectionBasic", [Action.MoveToCenter, Action.MoveToFullscreen]],
  ["SectionHalves", [Action.MoveToLeftHalf, Action.MoveToRightHalf, Action.MoveToTopHalf, Action.MoveToBottomHalf]],
  [
    "SectionCorners",
    [Action.MoveToUpperLeft, Action.MoveToUpperRight, Action.MoveToLowerLeft, Action.MoveToLowerRight],
  ],
  ["SectionThirds", [Action.MoveToNextThird, Action.MoveToPreviousThird]],
  ["SectionDisplays", [Action.MoveToNextDisplay, Action.MoveToPreviousDisplay]],
  ["SectionSize", [Action.MakeLarger, Action.MakeSmaller]],
  ["SectionHistory", [Action.UndoLastMove, Action.RedoLastMove]],
  ["SectionArrange", [Action.ArrangeWindows]],
];

export const ALL: readonly Action[] = [
  Action.MoveToCenter,
  Action.MoveToFullscreen,
  Action.MoveToLeftHalf,
  Action.MoveToRightHalf,
  Action.MoveToTopHalf,
  Action.MoveToBottomHalf,
  Action.MoveToUpperLeft,
  Action.MoveToLowerLeft,
  Action.MoveToUpperRight,
  Action.MoveToLowerRight,
  Action.MoveToNextDisplay,
  Action.MoveToPreviousDisplay,
  Action.MoveToNextThird,
  Action.MoveToPreviousThird,
  Action.MakeLarger,
  Action.MakeSmaller,
  Action.UndoLastMove,
  Action.RedoLastMove,
  Action.ArrangeWindows,
];

export function name(action: Action): string {
  return action;
}

export function fromName(name: string): Action | null {
  return ALL.find((a) => a === name) ?? null;
}

const JS_NAMES: Readonly<Record<Action, string | null>> = {
  MoveToCenter: "SplitWindowActionCenter",
  MoveToFullscreen: "SplitWindowActionFullscreen",
  MoveToLeftHalf: "SplitWindowActionLeftHalf",
  MoveToRightHalf: "SplitWindowActionRightHalf",
  MoveToTopHalf: "SplitWindowActionTopHalf",
  MoveToBottomHalf: "SplitWindowActionBottomHalf",
  MoveToUpperLeft: "SplitWindowActionUpperLeft",
  MoveToLowerLeft: "SplitWindowActionLowerLeft",
  MoveToUpperRight: "SplitWindowActionUpperRight",
  MoveToLowerRight: "SplitWindowActionLowerRight",
  MoveToNextDisplay: "SplitWindowActionNextDisplay",
  MoveToPreviousDisplay: "SplitWindowActionPreviousDisplay",
  MoveToNextThird: "SplitWindowActionNextThird",
  MoveToPreviousThird: "SplitWindowActionPreviousThird",
  MakeLarger: "SplitWindowActionLarger",
  MakeSmaller: "SplitWindowActionSmaller",
  UndoLastMove: null,
  RedoLastMove: null,
  ArrangeWindows: null,
};

/** The name used by `windowPositionCalculationRegistry` in the JavaScript files. */
export function jsName(action: Action): string | null {
  return JS_NAMES[action];
}

/** Actions that fill a fraction of the screen and so leave a gap around the window. */
export function usesGap(action: Action): boolean {
  switch (action) {
    case Action.MoveToFullscreen:
    case Action.MoveToLeftHalf:
    case Action.MoveToRightHalf:
    case Action.MoveToTopHalf:
    case Action.MoveToBottomHalf:
    case Action.MoveToUpperLeft:
    case Action.MoveToUpperRight:
    case Action.MoveToLowerLeft:
    case Action.MoveToLowerRight:
    case Action.MoveToNextThird:
    case Action.MoveToPreviousThird:
      return true;
    default:
      return false;
  }
}

export function movesToDisplay(action: Action): boolean {
  return action === Action.MoveToNextDisplay || action === Action.MoveToPreviousDisplay;
}

/**
 * Where a half or corner move landed in its 1/2 → 3/4 → 1/4 cycle, so the label can say which turn
 * it was: "3/4", "1/4", or null at 1/2 and for every other action. Top and bottom halves cycle the
 * height, the rest the width; the nearest step wins because the gap trims a few points off each.
 */
export function cycleStep(action: Action, rect: { width: number; height: number }, workArea: { width: number; height: number }): "3/4" | "1/4" | null {
  let share: number;
  switch (action) {
    case Action.MoveToTopHalf:
    case Action.MoveToBottomHalf:
      share = rect.height / workArea.height;
      break;
    case Action.MoveToLeftHalf:
    case Action.MoveToRightHalf:
    case Action.MoveToUpperLeft:
    case Action.MoveToUpperRight:
    case Action.MoveToLowerLeft:
    case Action.MoveToLowerRight:
      share = rect.width / workArea.width;
      break;
    default:
      return null;
  }
  const steps = [0.25, 0.5, 0.75] as const;
  const nearest = steps.reduce((best, step) => (Math.abs(share - step) < Math.abs(share - best) ? step : best));
  return nearest === 0.75 ? "3/4" : nearest === 0.25 ? "1/4" : null;
}
