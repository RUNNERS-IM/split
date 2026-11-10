/**
 * The tray menu on macOS is a panel Split draws (src/renderer/panel), the same look as Monitor's and Prompt's
 * (decision 2026-11-05 "네 앱 메뉴 패널 통일"). The items still come from the one menu template that builds the
 * plain menu on Windows and Linux; this turns that template into what the panel page draws, and keeps the clicks
 * here in the main process by number.
 *
 * A checkbox at the top level is an on/off line and is drawn as a switch; a checkbox inside a submenu is a choice and
 * gets a check mark. A submenu opens inside the panel under its line instead of beside it.
 */
import type { PanelItem } from "../shared/types";

/** The parts of an Electron menu item this needs (MenuItemConstructorOptions without Electron). */
export type TemplateItem = {
  id?: string;
  type?: "normal" | "separator" | "submenu" | "checkbox" | "radio" | "header" | "palette";
  label?: string;
  sublabel?: string;
  toolTip?: string;
  enabled?: boolean;
  checked?: boolean;
  accelerator?: unknown;
  icon?: unknown;
  submenu?: unknown;
  click?: (...args: never[]) => void;
}

export type PanelConversion = {
  items: PanelItem[];
  /** Item id → what it does. */
  clicks: Map<string, () => void>;
}

export type ConvertOptions = {
  /** The picture of an item as a data URL, and whether it is a template (drawn in the text colour). */
  image(icon: unknown): { src: string; template: boolean } | null;
  /** The item id standing for the layout panel, and what it turns into. */
  layoutPanelId: string;
  layoutCard: unknown;
  /** The sublabel that means "Pro", shown as a small pill. */
  proSublabel: string;
  /** An Electron accelerator such as "Alt+Command+Left" as people read it ("⌥⌘←"). */
  shortcut(accelerator: string): string;
}

export function convertTemplate(template: TemplateItem[], options: ConvertOptions): PanelConversion {
  const clicks = new Map<string, () => void>();
  const remember = (run: () => void): string => {
    const id = String(clicks.size);
    clicks.set(id, run);
    return id;
  };
  const convert = (items: TemplateItem[], topLevel: boolean): PanelItem[] => {
    const out: PanelItem[] = [];
    for (const item of items) {
      if (item.type === "separator") {
        // Why: two separators in a row, or one at an edge, would draw an empty band.
        if (out.length > 0 && out.at(-1)?.kind !== "separator") {out.push({ kind: "separator" });}
        continue;
      }
      if (item.id === options.layoutPanelId) {
        out.push({ kind: "layouts", card: options.layoutCard });
        continue;
      }
      const label = item.label ?? "";
      // A disabled line with nothing behind it is a section title ("Layouts").
      if (item.enabled === false && !item.icon && !item.submenu && !item.click) {
        out.push({ kind: "heading", label });
        continue;
      }
      const picture = item.icon ? options.image(item.icon) : null;
      const common = {
        label,
        name: item.id,
        image: picture?.src,
        template: picture?.template,
        enabled: item.enabled !== false,
        ...(item.toolTip ? { toolTip: item.toolTip } : {}),
      };
      if (Array.isArray(item.submenu)) {
        out.push({ kind: "group", ...common, id: `group:${out.length}:${label}`, items: convert(item.submenu as TemplateItem[], false) });
        continue;
      }
      const click = item.click;
      const id = click ? remember(() => click()) : "";
      if (item.type === "checkbox" && topLevel) {
        out.push({ kind: "switch", ...common, id, on: item.checked === true });
        continue;
      }
      out.push({
        kind: "item",
        ...common,
        id,
        checked: item.type === "checkbox" && item.checked === true,
        ...(typeof item.accelerator === "string" ? { shortcut: options.shortcut(item.accelerator) } : {}),
        ...(item.sublabel === options.proSublabel ? { pill: item.sublabel } : item.sublabel ? { sublabel: item.sublabel } : {}),
      });
    }
    while (out.length > 0 && out.at(-1)?.kind === "separator") {out.pop();}
    return out;
  };
  return { items: convert(template, true), clicks };
}

const KEY_SYMBOLS: Record<string, string> = {
  command: "⌘",
  cmd: "⌘",
  cmdorctrl: "⌘",
  commandorcontrol: "⌘",
  alt: "⌥",
  option: "⌥",
  control: "⌃",
  ctrl: "⌃",
  shift: "⇧",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  enter: "↩",
  return: "↩",
  backspace: "⌫",
  delete: "⌦",
  escape: "⎋",
  esc: "⎋",
  tab: "⇥",
  space: "Space",
};

// Why: macOS menus write the modifiers in this order whatever order the shortcut was typed in.
const MODIFIER_ORDER = ["⌃", "⌥", "⇧", "⌘"];

/** "Alt+Command+Left" → "⌥⌘←", in the order macOS menus show the keys. */
export function macShortcut(accelerator: string): string {
  const parts = accelerator.split("+").map((part) => KEY_SYMBOLS[part.toLowerCase()] ?? part.toUpperCase());
  const modifiers = parts.filter((part) => MODIFIER_ORDER.includes(part)).sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part));
  return [...modifiers, ...keys].join("");
}
