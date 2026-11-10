import assert from "node:assert/strict";
import { test } from "vitest";

import { Rect, rectWithGap } from "../../src/core/geometry.ts";

test("gap keeps screen edges flush", () => {
  const screen = new Rect(0, 0, 1920, 1040);
  const left = rectWithGap(new Rect(0, 0, 960, 1040), screen, 16);
  assert.deepEqual(left, new Rect(0, 0, 952, 1040));
  const right = rectWithGap(new Rect(960, 0, 960, 1040), screen, 16);
  assert.deepEqual(right, new Rect(968, 0, 952, 1040));
});

test("flipping twice is identity", () => {
  const r = new Rect(10, 20, 300, 400);
  assert.deepEqual(r.flipped().flipped(), r);
});
