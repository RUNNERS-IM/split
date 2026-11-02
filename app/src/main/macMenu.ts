// The tray menu on macOS. Electron menus hold only plain items, so here the same template that
// builds the menu elsewhere is turned into JSON for native/mac/menu.m, which draws it with the
// "Layouts" panel the macOS app (2.6.1030) had in place of the LAYOUT_PANEL_ID item.
import type { MenuItemConstructorOptions } from "electron";
import { LAYOUT_PANEL_ID, type LayoutPanel } from "./layouts.ts";
import { proSublabel } from "./pro.ts";

export interface MacMenuNative {
  popUpMenu(spec: string, x: number, y: number): string | null;
}

/**
 * Shows `template` with its top-left corner at (`x`, `y`) (top-left based screen points) and runs
 * what was chosen once the menu closed.
 */
let showing = false;

export function popUpMacMenu(native: MacMenuNative, template: MenuItemConstructorOptions[], panel: LayoutPanel, x: number, y: number): void {
  // Why: `--menu` can arrive while the menu is already open; a second one on top would leave two.
  if (showing) return;
  const clicks = new Map<string, () => void>();
  const convert = (items: MenuItemConstructorOptions[]): unknown[] =>
    items.map((item) => {
      if (item.type === "separator") return { type: "separator" };
      if (item.id === LAYOUT_PANEL_ID) return { type: "card", card: panel.card };
      // Why: a disabled item with nothing behind it is a section title ("Layouts").
      if (item.enabled === false && !item.icon && !item.submenu && !item.click) return { type: "header", label: item.label };
      const spec: Record<string, unknown> = { label: item.label ?? "" };
      if (item.icon && typeof item.icon !== "string") {
        spec.image = item.icon.toPNG({ scaleFactor: 2 }).toString("base64");
        spec.template = item.icon.isTemplateImage();
      }
      if (item.sublabel === proSublabel()) spec.pill = item.sublabel;
      if (item.toolTip) spec.toolTip = item.toolTip;
      if (item.type === "checkbox" && item.checked) spec.checked = true;
      if (typeof item.accelerator === "string") spec.accelerator = item.accelerator;
      if (item.enabled === false) spec.enabled = false;
      if (Array.isArray(item.submenu)) {
        spec.submenu = convert(item.submenu);
      } else if (item.click) {
        const id = String(clicks.size);
        const click = item.click;
        clicks.set(id, () => click(undefined as never, undefined, undefined as never));
        spec.id = id;
      }
      return spec;
    });
  showing = true;
  let chosen: string | null;
  try {
    chosen = native.popUpMenu(JSON.stringify(convert(template)), x, y);
  } finally {
    showing = false;
  }
  if (chosen === null) return;
  const click = clicks.get(chosen);
  if (click) {
    click();
  } else {
    panel.choose(chosen);
  }
}
