// Where each window action puts a window. Every function takes rectangles with the origin at the bottom left, the way
// these calculations were first written for the macOS app, and returns a new one; calc.ts turns the screen's top-left
// rectangles into these and back.

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The window, the work area of the screen it is on and the work area of the screen it goes to. */
export type Calculation = (window: Frame, source: Frame, destination: Frame) => Frame;

/** How much a window counts as "still in that place", because apps round their sizes. */
const NEAR = 1;
/** How far from a screen edge a window still counts as touching it. */
const EDGE = 5;
const RESIZE_STEP = 30;

const midX = (r: Frame): number => r.x + r.width / 2;
const midY = (r: Frame): number => r.y + r.height / 2;
const maxX = (r: Frame): number => r.x + r.width;
const maxY = (r: Frame): number => r.y + r.height;
const contains = (a: Frame, b: Frame): boolean => b.x >= a.x && b.y >= a.y && maxX(b) <= maxX(a) && maxY(b) <= maxY(a);

/** `inner` lies inside `outer` with the same middle. */
function centeredWithin(outer: Frame, inner: Frame): boolean {
  return contains(outer, inner) && Math.abs(midX(inner) - midX(outer)) <= NEAR && Math.abs(midY(inner) - midY(outer)) <= NEAR;
}

function center(window: Frame, screen: Frame): Frame {
  return {
    ...window,
    x: Math.round((screen.width - window.width) / 2) + screen.x,
    y: Math.round((screen.height - window.height) / 2) + screen.y,
  };
}

function moveToDisplay(window: Frame, _source: Frame, destination: Frame): Frame {
  return window.width <= destination.width && window.height <= destination.height ? center(window, destination) : destination;
}

/** Pressing a half or corner again goes 1/2 → 3/4 → 1/4 of that side, while the window is still lined up with it. */
function cycle(window: Frame, lined: boolean, half: Frame, threeQuarters: Frame, oneFourth: Frame): Frame {
  if (lined) {
    if (centeredWithin(half, window)) return threeQuarters;
    if (centeredWithin(threeQuarters, window)) return oneFourth;
  }
  return half;
}

const threeQuarters = (length: number): number => Math.floor((length * 3) / 4);
const oneFourth = (length: number): number => Math.floor(length / 4);
const half = (length: number): number => Math.floor(length / 2);

/** Same width or height steps for a side or corner that keeps to the left of the screen. */
function fromLeft(window: Frame, s: Frame, one: Frame): Frame {
  return cycle(window, Math.abs(midY(window) - midY(one)) <= NEAR, one, { ...one, width: threeQuarters(s.width) }, { ...one, width: oneFourth(s.width) });
}

/** The same for one that keeps to the right: the window's right edge stays on the screen's. */
function fromRight(window: Frame, s: Frame, one: Frame): Frame {
  const sized = (width: number): Frame => ({ ...one, width, x: s.x + s.width - width });
  return cycle(window, Math.abs(midY(window) - midY(one)) <= NEAR, one, sized(threeQuarters(s.width)), sized(oneFourth(s.width)));
}

const leftHalf: Calculation = (window, _source, s) => fromLeft(window, s, { ...s, width: half(s.width) });

const rightHalf: Calculation = (window, _source, s) => fromRight(window, s, { ...s, width: half(s.width), x: s.x + half(s.width) });

const bottomHalf: Calculation = (window, _source, s) => {
  const one = { ...s, height: half(s.height) };
  return cycle(window, Math.abs(midX(window) - midX(one)) <= NEAR, one, { ...one, height: threeQuarters(s.height) }, { ...one, height: oneFourth(s.height) });
};

const topHalf: Calculation = (window, _source, s) => {
  const one = { ...s, height: half(s.height), y: s.y + half(s.height) + s.height % 2 };
  const sized = (height: number): Frame => ({ ...one, height, y: s.y + s.height - height });
  return cycle(window, Math.abs(midX(window) - midX(one)) <= NEAR, one, sized(threeQuarters(s.height)), sized(oneFourth(s.height)));
};

/** A corner of the screen: half as wide and half as high. */
const quarter = (s: Frame): Frame => ({ ...s, width: half(s.width), height: half(s.height) });
const upperY = (s: Frame): number => s.y + half(s.height) + s.height % 2;

const lowerLeft: Calculation = (window, _source, s) => fromLeft(window, s, quarter(s));
const upperLeft: Calculation = (window, _source, s) => fromLeft(window, s, { ...quarter(s), y: upperY(s) });
const lowerRight: Calculation = (window, _source, s) => fromRight(window, s, { ...quarter(s), x: s.x + half(s.width) });
const upperRight: Calculation = (window, _source, s) => fromRight(window, s, { ...quarter(s), x: s.x + half(s.width), y: upperY(s) });

/** The three columns of a screen, then its three rows from the top. */
function thirds(s: Frame): Frame[] {
  const width = Math.floor(s.width / 3);
  const height = Math.floor(s.height / 3);
  return [
    ...[0, 1, 2].map((i) => ({ ...s, x: s.x + width * i, width })),
    ...[0, 1, 2].map((i) => ({ ...s, y: s.y + s.height - height * (i + 1), height })),
  ];
}

function otherThird(window: Frame, s: Frame, step: 1 | -1): Frame {
  const all = thirds(s);
  const at = all.findIndex((third) => centeredWithin(third, window));
  return at < 0 ? all[0]! : all[(at + step + all.length) % all.length]!;
}

/** Grows or shrinks by `offset`, keeping the screen edges the window already touches. A window that would get too small stays as it is. */
function resize(window: Frame, s: Frame, offset: number): Frame {
  const touchesLeft = Math.abs(window.x - s.x) <= EDGE;
  const touchesRight = Math.abs(maxX(window) - maxX(s)) <= EDGE;
  const touchesTop = Math.abs(maxY(window) - maxY(s)) <= EDGE;
  const touchesBottom = Math.abs(window.y - s.y) <= EDGE;
  const step = Math.floor(offset / 2);
  const out = { ...window, width: window.width + offset, x: window.x - step };
  if (touchesRight) {
    out.x = maxX(s) - out.width;
    if (touchesLeft) out.width = s.width;
  }
  if (touchesLeft) out.x = s.x;
  if (out.width >= s.width) out.width = s.width;
  out.height += offset;
  out.y -= step;
  if (touchesTop) {
    out.y = maxY(s) - out.height;
    if (touchesBottom) out.height = s.height;
  }
  if (touchesBottom) out.y = s.y;
  if (out.height >= s.height) {
    out.height = s.height;
    out.y = window.y;
  }
  if (touchesLeft && touchesRight && touchesTop && touchesBottom && offset < 0) {
    out.width = window.width + offset;
    out.x = window.x - step;
    out.height = window.height + offset;
    out.y = window.y - step;
  }
  return out.width <= Math.floor(s.width / 4) || out.height <= Math.floor(s.height / 4) ? window : out;
}

/** Keyed by the action's name in actions.ts. Actions that are not here (undo, redo, arrange) have no calculation. */
export const CALCULATIONS: Partial<Record<string, Calculation>> = {
  MoveToCenter: (window, _source, s) => center(window, s),
  MoveToFullscreen: (_window, _source, s) => s,
  MoveToLeftHalf: leftHalf,
  MoveToRightHalf: rightHalf,
  MoveToTopHalf: topHalf,
  MoveToBottomHalf: bottomHalf,
  MoveToUpperLeft: upperLeft,
  MoveToLowerLeft: lowerLeft,
  MoveToUpperRight: upperRight,
  MoveToLowerRight: lowerRight,
  MoveToNextThird: (window, _source, s) => otherThird(window, s, 1),
  MoveToPreviousThird: (window, _source, s) => otherThird(window, s, -1),
  MoveToNextDisplay: moveToDisplay,
  MoveToPreviousDisplay: moveToDisplay,
  MakeLarger: (window, _source, s) => resize(window, s, RESIZE_STEP),
  MakeSmaller: (window, _source, s) => resize(window, s, -RESIZE_STEP),
};
