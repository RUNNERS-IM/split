// Runs a window position calculation (calculations.ts). All rectangles here are top-left based; they are mirrored into
// the bottom-left based coordinates the calculations were written for and back.

import { type Action } from "./actions.ts";
import { CALCULATIONS, type Frame } from "./calculations.ts";
import { Rect } from "./geometry.ts";

function frame(rect: Rect): Frame {
  const { x, y, width, height } = rect.flipped();
  return { x, y, width, height };
}

/** Where `action` puts a window, or `null` for actions without a calculation (undo, redo, arrange). */
export function calculate(action: Action, window: Rect, sourceVisibleFrame: Rect, destinationVisibleFrame: Rect): Rect | null {
  const calculation = CALCULATIONS[action];
  if (!calculation) return null;
  const { x, y, width, height } = calculation(frame(window), frame(sourceVisibleFrame), frame(destinationVisibleFrame));
  return new Rect(x, y, width, height).flipped();
}
