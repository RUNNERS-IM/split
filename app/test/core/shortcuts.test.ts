import assert from "node:assert/strict";
import { test } from "vitest";

import { ALL } from "../../src/core/actions.ts";
import { DEFAULT_SHORTCUTS, KeyCombo } from "../../src/core/shortcuts.ts";

test("every default parses and round trips", () => {
  for (const [action, text] of DEFAULT_SHORTCUTS) {
    const combo = KeyCombo.parse(text);
    assert.ok(combo !== null, action);
    assert.equal(combo.toText(), text);
  }
  assert.equal(DEFAULT_SHORTCUTS.length, ALL.length);
});

test("plain letters are refused", () => {
  assert.equal(KeyCombo.parse("a"), null);
  assert.equal(KeyCombo.parse("shift+a"), null);
  assert.equal(KeyCombo.parse("ctrl+nonsense"), null);
});

test("gnome accelerators", () => {
  const combo = KeyCombo.parse("ctrl+shift+super+left");
  assert.ok(combo !== null);
  assert.equal(combo.toGtkAccelerator(), "<Control><Shift><Super>Left");
});
