// Shortcut text ("alt+super+left") turned into what Electron registers and what people read.
import { KeyCombo } from "../core/shortcuts.ts";

const ACCELERATOR_KEYS: Record<string, string> = {
  left: "Left", right: "Right", up: "Up", down: "Down", space: "Space", enter: "Enter", tab: "Tab",
  backspace: "Backspace", delete: "Delete", insert: "Insert", home: "Home", end: "End",
  pageup: "PageUp", pagedown: "PageDown", minus: "-", equal: "=", bracketleft: "[", bracketright: "]",
  semicolon: ";", quote: "'", comma: ",", period: ".", slash: "/", backslash: "\\", grave: "`",
};

const MAC_GLYPHS: Record<string, string> = {
  left: "←", right: "→", up: "↑", down: "↓", space: "Space", enter: "↩", tab: "⇥", backspace: "⌫",
  delete: "⌦", insert: "Ins", home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟", minus: "-", equal: "=",
  bracketleft: "[", bracketright: "]", semicolon: ";", quote: "'", comma: ",", period: ".", slash: "/",
  backslash: "\\", grave: "`",
};

const OTHER_NAMES: Record<string, string> = { ...ACCELERATOR_KEYS, pageup: "Page Up", pagedown: "Page Down" };

function keyName(key: string, names: Record<string, string>): string {
  return names[key] ?? key.toUpperCase();
}

/** The Electron accelerator, for example `Alt+Command+Left`. */
export function accelerator(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.modifiers.ctrl) {parts.push("Control");}
  if (combo.modifiers.alt) {parts.push("Alt");}
  if (combo.modifiers.shift) {parts.push("Shift");}
  if (combo.modifiers.logo) {parts.push(process.platform === "darwin" ? "Command" : "Super");}
  parts.push(keyName(combo.key, ACCELERATOR_KEYS));
  return parts.join("+");
}

/** How the shortcut is written on screen: `⌥⌘←` on macOS, `Alt+Super+Left` elsewhere. */
export function displayShortcut(combo: KeyCombo): string {
  if (process.platform === "darwin") {
    const { ctrl, alt, shift, logo } = combo.modifiers;
    return `${ctrl ? "⌃" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${logo ? "⌘" : ""}${keyName(combo.key, MAC_GLYPHS)}`;
  }
  const parts: string[] = [];
  if (combo.modifiers.ctrl) {parts.push("Ctrl");}
  if (combo.modifiers.alt) {parts.push("Alt");}
  if (combo.modifiers.shift) {parts.push("Shift");}
  if (combo.modifiers.logo) {parts.push(process.platform === "win32" ? "Win" : "Super");}
  parts.push(keyName(combo.key, OTHER_NAMES));
  return parts.join("+");
}

export function displayText(text: string | null): string {
  const combo = text ? KeyCombo.parse(text) : null;
  return combo ? displayShortcut(combo) : "";
}
