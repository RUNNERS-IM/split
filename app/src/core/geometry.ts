// Rectangles in top-left based screen coordinates (y grows downward), which is what Windows,
// X11, GNOME Shell and KWin all use.

/**
 * Why: Rust's `f64::round` rounds halves away from zero; `Math.round` rounds them up, which
 * differs for negative coordinates on screens left of or above the main one.
 */
export function round(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

export class Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  static from(value: { x: number; y: number; width: number; height: number }): Rect {
    return new Rect(value.x, value.y, value.width, value.height);
  }

  equals(other: Rect): boolean {
    return this.x === other.x && this.y === other.y && this.width === other.width && this.height === other.height;
  }

  maxX(): number {
    return this.x + this.width;
  }

  maxY(): number {
    return this.y + this.height;
  }

  midX(): number {
    return this.x + this.width / 2.0;
  }

  midY(): number {
    return this.y + this.height / 2.0;
  }

  area(): number {
    return Math.max(this.width, 0.0) * Math.max(this.height, 0.0);
  }

  isEmpty(): boolean {
    return this.width <= 0.0 || this.height <= 0.0;
  }

  containsPoint(x: number, y: number): boolean {
    return x >= this.x && x < this.maxX() && y >= this.y && y < this.maxY();
  }

  containsRect(other: Rect): boolean {
    return other.x >= this.x && other.y >= this.y && other.maxX() <= this.maxX() && other.maxY() <= this.maxY();
  }

  intersection(other: Rect): Rect | null {
    const x = Math.max(this.x, other.x);
    const y = Math.max(this.y, other.y);
    const maxX = Math.min(this.maxX(), other.maxX());
    const maxY = Math.min(this.maxY(), other.maxY());
    return maxX > x && maxY > y ? new Rect(x, y, maxX - x, maxY - y) : null;
  }

  /**
   * The same rectangle mirrored around y = 0. macOS hands the JavaScript calculations
   * bottom-left based rectangles; mirroring turns ours into that and back again. Every
   * calculation only adds, subtracts and rounds sizes, so where y = 0 sits does not matter.
   */
  flipped(): Rect {
    // Why `0 -` and not `-`: it never gives -0, which `Object.is` and deep equality tell apart from 0.
    return new Rect(this.x, 0 - (this.y + this.height), this.width, this.height);
  }

  rounded(): Rect {
    return new Rect(round(this.x), round(this.y), round(this.width), round(this.height));
  }
}

/**
 * Apps such as terminals round their size to whole characters, so a window counts as still
 * where Split put it when every edge is within this distance.
 */
export const MATCH_TOLERANCE = 24.0;

export function roughlyEqual(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= MATCH_TOLERANCE &&
    Math.abs(a.y - b.y) <= MATCH_TOLERANCE &&
    Math.abs(a.maxX() - b.maxX()) <= MATCH_TOLERANCE &&
    Math.abs(a.maxY() - b.maxY()) <= MATCH_TOLERANCE
  );
}

/** Space between windows in points, as on macOS: none, narrow, normal, wide. */
export const GAP_CHOICES: readonly [number, number, number, number] = [0.0, 8.0, 16.0, 24.0];
export const DEFAULT_GAP = 8.0;

/**
 * Shrinks `rect` by half of `gap` on every side that faces another window, so two neighbours
 * end up `gap` apart. Sides on the edge of `visibleFrame` stay on the edge.
 * Port of `SplitRectWithGap` in `SplitWindowArranger.m`.
 */
export function rectWithGap(rect: Rect, visibleFrame: Rect, gap: number): Rect {
  if (gap <= 0.0) {
    return rect;
  }
  const half = gap / 2.0;
  const left = Math.abs(rect.x - visibleFrame.x) <= 1.0 ? 0.0 : half;
  const right = Math.abs(rect.maxX() - visibleFrame.maxX()) <= 1.0 ? 0.0 : half;
  const top = Math.abs(rect.y - visibleFrame.y) <= 1.0 ? 0.0 : half;
  const bottom = Math.abs(rect.maxY() - visibleFrame.maxY()) <= 1.0 ? 0.0 : half;
  const result = new Rect(
    round(rect.x + left),
    round(rect.y + top),
    round(rect.width - left - right),
    round(rect.height - top - bottom),
  );
  if (result.width > 0.0 && result.height > 0.0) {
    return result;
  }
  return rect;
}
