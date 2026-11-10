import assert from "node:assert/strict";
import { test } from "vitest";

import { convertTemplate, macShortcut, type TemplateItem } from "../../src/core/panelItems.ts";

const options = {
  image: (icon: unknown) => (icon ? { src: `data:${String(icon)}`, template: true } : null),
  layoutPanelId: "layouts",
  layoutCard: { screens: [] },
  proSublabel: "Pro",
  shortcut: macShortcut,
};

test("a checkbox at the top is a switch, one in a submenu a checked line", () => {
  let ran = 0;
  const template: TemplateItem[] = [
    { id: "login", label: "Open at Login", type: "checkbox", checked: true, click: () => ran++ },
    { label: "Turn Off", icon: "pause", submenu: [{ label: "For an Hour", type: "checkbox", checked: true, click: () => ran++ }] },
  ];
  const { items, clicks } = convertTemplate(template, options);
  assert.equal(items[0].kind, "switch");
  assert.equal(items[0].kind === "switch" && items[0].on, true);
  assert.equal(items[0].kind === "switch" && items[0].name, "login");
  const group = items[1];
  assert.equal(group.kind, "group");
  const inner = group.kind === "group" ? group.items[0] : null;
  assert.equal(inner?.kind === "item" && inner.checked, true);
  for (const run of clicks.values()) run();
  assert.equal(ran, 2);
});

test("separators never double up or sit at the end", () => {
  const { items } = convertTemplate(
    [{ type: "separator" }, { label: "A", click: () => {} }, { type: "separator" }, { type: "separator" }, { label: "B", click: () => {} }, { type: "separator" }],
    options,
  );
  assert.deepEqual(items.map((item) => item.kind), ["item", "separator", "item"]);
});

test("the layout item becomes the layout card and a bare disabled line a heading", () => {
  const { items } = convertTemplate([{ label: "Layouts", enabled: false }, { id: "layouts", label: "" }], options);
  assert.deepEqual(items, [{ kind: "heading", label: "Layouts" }, { kind: "layouts", card: { screens: [] } }]);
});

test("shortcuts read as in macOS menus", () => {
  assert.equal(macShortcut("Alt+Command+Left"), "⌥⌘←");
  assert.equal(macShortcut("Command+Shift+Alt+Control+Right"), "⌃⌥⇧⌘→");
  assert.equal(macShortcut("Command+,"), "⌘,");
  assert.equal(macShortcut("Alt+Command+C"), "⌥⌘C");
});

test("the Pro sublabel is a pill and a shortcut is kept", () => {
  const { items } = convertTemplate([{ label: "Save", sublabel: "Pro", accelerator: "Command+S", click: () => {} }], options);
  const item = items[0];
  assert.equal(item.kind === "item" && item.pill, "Pro");
  assert.equal(item.kind === "item" && item.shortcut, "⌘S");
});
