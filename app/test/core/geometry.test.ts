import assert from "node:assert/strict";
import { test } from "vitest";

import { Rect, rectWithGap } from "../../src/core/geometry.ts";

test("gap keeps screen edges flush", () => {
  const screen = new Rect(0.0, 0.0, 1920.0, 1040.0);
  const left = rectWithGap(new Rect(0.0, 0.0, 960.0, 1040.0), screen, 16.0);
  assert.deepEqual(left, new Rect(0.0, 0.0, 952.0, 1040.0));
  const right = rectWithGap(new Rect(960.0, 0.0, 960.0, 1040.0), screen, 16.0);
  assert.deepEqual(right, new Rect(968.0, 0.0, 952.0, 1040.0));
});

test("flipping twice is identity", () => {
  const r = new Rect(10.0, 20.0, 300.0, 400.0);
  assert.deepEqual(r.flipped().flipped(), r);
});
