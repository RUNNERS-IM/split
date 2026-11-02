import assert from "node:assert/strict";
import { test } from "node:test";

import { Action, cycleStep } from "../../src/core/actions.ts";
import { Engine, type Screen, type Snapshot, screensInConsistentOrder } from "../../src/core/engine.ts";
import { Rect } from "../../src/core/geometry.ts";
import { SCRIPTS } from "./scripts.ts";

function screen(x: number, primary: boolean): Screen {
  return {
    frame: new Rect(x, 0.0, 1920.0, 1080.0),
    workArea: new Rect(x, 0.0, 1920.0, 1040.0),
    scale: 1.0,
    primary,
  };
}

function snapshot(rect: Rect): Snapshot {
  return {
    active: { id: 7, rect, app: "editor" },
    screens: [screen(0.0, true), screen(1920.0, false)],
    windows: [],
  };
}

test("halves keep cycling with a gap", () => {
  const engine = new Engine(SCRIPTS);
  const first = engine.plan(Action.MoveToLeftHalf, snapshot(new Rect(100.0, 100.0, 800.0, 600.0)), 16.0);
  assert.deepEqual(first.moves[0]!.rect, new Rect(0.0, 0.0, 952.0, 1040.0));
  const second = engine.plan(Action.MoveToLeftHalf, snapshot(first.moves[0]!.rect), 16.0);
  assert.deepEqual(second.moves[0]!.rect, new Rect(0.0, 0.0, 1432.0, 1040.0));
  const third = engine.plan(Action.MoveToLeftHalf, snapshot(second.moves[0]!.rect), 16.0);
  assert.deepEqual(third.moves[0]!.rect, new Rect(0.0, 0.0, 472.0, 1040.0));
});

test("the label names each turn of the half and corner cycle", () => {
  const engine = new Engine(SCRIPTS);
  const area = screen(0.0, true).workArea;
  for (const action of [Action.MoveToLeftHalf, Action.MoveToTopHalf, Action.MoveToUpperRight]) {
    let rect = new Rect(100.0, 100.0, 800.0, 600.0);
    const steps = [];
    for (let turn = 0; turn < 3; turn += 1) {
      rect = engine.plan(action, snapshot(rect), 16.0).moves[0]!.rect;
      steps.push(cycleStep(action, rect, area));
    }
    assert.deepEqual(steps, [null, "3/4", "1/4"], action);
  }
  assert.equal(cycleStep(Action.MoveToCenter, new Rect(0.0, 0.0, 480.0, 260.0), area), null);
});

test("fullscreen twice restores", () => {
  const engine = new Engine(SCRIPTS);
  const start = new Rect(100.0, 100.0, 800.0, 600.0);
  const full = engine.plan(Action.MoveToFullscreen, snapshot(start), 0.0);
  assert.deepEqual(full.moves[0]!.rect, new Rect(0.0, 0.0, 1920.0, 1040.0));
  const back = engine.plan(Action.MoveToFullscreen, snapshot(full.moves[0]!.rect), 0.0);
  assert.deepEqual(back.moves[0]!.rect, start);
});

test("undo and redo walk the history", () => {
  const engine = new Engine(SCRIPTS);
  const start = new Rect(100.0, 100.0, 800.0, 600.0);
  const half = engine.plan(Action.MoveToRightHalf, snapshot(start), 0.0).moves[0]!.rect;
  const undo = engine.plan(Action.UndoLastMove, snapshot(half), 0.0);
  assert.deepEqual(undo.moves[0]!.rect, start);
  const redo = engine.plan(Action.RedoLastMove, snapshot(start), 0.0);
  assert.deepEqual(redo.moves[0]!.rect, half);
  assert.deepEqual(engine.plan(Action.RedoLastMove, snapshot(half), 0.0).feedback, { kind: "Failed" });
});

test("next display wraps around", () => {
  const engine = new Engine(SCRIPTS);
  const moved = engine.plan(Action.MoveToNextDisplay, snapshot(new Rect(0.0, 0.0, 800.0, 600.0)), 0.0);
  assert.deepEqual(moved.moves[0]!.rect, new Rect(2480.0, 220.0, 800.0, 600.0));
  const back = engine.plan(Action.MoveToNextDisplay, snapshot(moved.moves[0]!.rect), 0.0);
  assert.deepEqual(back.moves[0]!.rect, new Rect(560.0, 220.0, 800.0, 600.0));
});

test("arrange then one undo puts everything back", () => {
  const engine = new Engine(SCRIPTS);
  const snap = snapshot(new Rect(100.0, 100.0, 800.0, 600.0));
  snap.windows = [
    { id: 1, rect: new Rect(100.0, 100.0, 800.0, 600.0), app: "a" },
    { id: 2, rect: new Rect(300.0, 200.0, 700.0, 500.0), app: "b" },
    { id: 3, rect: new Rect(2000.0, 200.0, 700.0, 500.0), app: "c" },
    { id: 4, rect: new Rect(10.0, 10.0, 40.0, 40.0), app: "d" },
  ];
  const arranged = engine.plan(Action.ArrangeWindows, snap, 0.0);
  assert.deepEqual(arranged.feedback, { kind: "Arranged", count: 2 });
  assert.deepEqual(arranged.moves[0], { id: 1, rect: new Rect(0.0, 0.0, 960.0, 1040.0) });
  const undone = engine.plan(Action.UndoLastMove, snap, 0.0);
  assert.deepEqual(undone.feedback, { kind: "ArrangeUndone" });
  assert.equal(undone.moves.length, 2);
});

test("primary screen comes first", () => {
  const ordered = screensInConsistentOrder([screen(-1920.0, false), screen(0.0, true), screen(1920.0, false)]);
  assert.ok(ordered[0]!.primary);
  assert.equal(ordered[1]!.frame.x, 1920.0);
});
