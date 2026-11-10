// Turning key presses into shortcut text ("ctrl+alt+super+left") and shortcut text into what
// the recorder shows: ⌃⌥⇧⌘← on macOS like the Mac app, "Ctrl+Alt+Win+Left" on Windows and Linux.
import { KeyCombo } from "../../core/shortcuts.ts";
import type { ViewState } from "../../shared/types.ts";

export type Platform = ViewState["platform"];

/** KeyboardEvent.code → our key name, for the keys that are not letters, digits or F-keys. */
const KEY_BY_CODE: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Space: "space",
  Enter: "enter",
  NumpadEnter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Minus: "minus",
  Equal: "equal",
  BracketLeft: "bracketleft",
  BracketRight: "bracketright",
  Semicolon: "semicolon",
  Quote: "quote",
  Comma: "comma",
  Period: "period",
  Slash: "slash",
  Backslash: "backslash",
  Backquote: "grave",
};

/** The Mac glyphs from SplitShortcutTranslations.m. */
const MAC_KEY_LABEL: Record<string, string> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  space: "Space",
  enter: "↩",
  tab: "⇥",
  backspace: "⌫",
  delete: "⌦",
  insert: "Ins",
  home: "↖",
  end: "↘",
  pageup: "⇞",
  pagedown: "⇟",
};

const PC_KEY_LABEL: Record<string, string> = {
  left: "Left",
  right: "Right",
  up: "Up",
  down: "Down",
  space: "Space",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

const PUNCTUATION: Record<string, string> = {
  minus: "-",
  equal: "=",
  bracketleft: "[",
  bracketright: "]",
  semicolon: ";",
  quote: "'",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  grave: "`",
};

/** Our key name for a key press, or null for a modifier on its own or a key Split can't use. */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code.toLowerCase();
  }
  return KEY_BY_CODE[code] ?? null;
}

/**
 * The shortcut text for a key press, or null while it is not a usable shortcut yet (only
 * modifiers held, or no ctrl / alt / super — those would swallow normal typing).
 * Uses the physical key (`code`), so ⌥C stays "c" and a Korean input source still records letters.
 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = keyName(event.code);
  if (!key) {
    return null;
  }
  const combo = new KeyCombo({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, logo: event.metaKey }, key);
  return KeyCombo.parse(combo.toText())?.toText() ?? null;
}

function keyLabel(key: string, platform: Platform): string {
  const named = (platform === "darwin" ? MAC_KEY_LABEL : PC_KEY_LABEL)[key];
  if (named) {
    return named;
  }
  return PUNCTUATION[key] ?? key.toUpperCase();
}

/** The modifiers held during a key event, the way the recorder shows them while recording. */
export function modifierLabel(
  modifiers: { ctrl: boolean; alt: boolean; shift: boolean; logo: boolean },
  platform: Platform,
): string {
  if (platform === "darwin") {
    return `${modifiers.ctrl ? "⌃" : ""}${modifiers.alt ? "⌥" : ""}${modifiers.shift ? "⇧" : ""}${modifiers.logo ? "⌘" : ""}`;
  }
  const parts: string[] = [];
  if (modifiers.ctrl) {parts.push("Ctrl");}
  if (modifiers.alt) {parts.push("Alt");}
  if (modifiers.shift) {parts.push("Shift");}
  if (modifiers.logo) {parts.push(platform === "win32" ? "Win" : "Super");}
  return parts.length > 0 ? `${parts.join("+")}+` : "";
}

/** How a stored shortcut is written on this platform; empty for none. */
export function displayShortcut(text: string | null | undefined, platform: Platform): string {
  if (!text) {
    return "";
  }
  const combo = KeyCombo.parse(text);
  if (!combo) {
    return text;
  }
  return modifierLabel(combo.modifiers, platform) + keyLabel(combo.key, platform);
}

/** The shortcut an action has now: the saved one, or the default when it was never changed. */
export function shortcutFor(state: ViewState, action: string): string | null {
  const saved = state.settings.shortcuts[action];
  return saved === undefined ? (state.defaults[action] ?? null) : saved;
}
