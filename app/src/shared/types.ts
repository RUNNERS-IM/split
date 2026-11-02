// What the main process and the pages (settings, overlay, shortcut list, about) send each other.
// The preload script exposes `SplitApi` as `window.split`; every shape here crosses that bridge.

export type FeedbackStyle = "off" | "subtle" | "strong";
export type FeedbackColor = "accent" | "blue" | "purple" | "pink" | "orange" | "green" | "gray";
export type FeedbackDuration = "short" | "normal" | "long";
export type FeedbackPosition = "bottom" | "top" | "center";

export interface FeedbackSettings {
  style: FeedbackStyle;
  color: FeedbackColor;
  showShortcut: boolean;
  duration: FeedbackDuration;
  position: FeedbackPosition;
}

export interface Settings {
  /** Space between windows in points: 0, 8, 16 or 24. */
  gap: number;
  launchAtLogin: boolean;
  showTrayIcon: boolean;
  autoUpdate: boolean;
  /** Holding ⌥⌘ for a second shows the shortcut list. */
  shortcutSheet: boolean;
  rearrangeOnDisplayChange: boolean;
  feedback: FeedbackSettings;
  /** Action name → shortcut such as "alt+super+left"; a missing action uses the default, null means cleared. */
  shortcuts: Record<string, string | null>;
  /** Bundle ids (macOS) or executable names where shortcuts stay off while that app is in front. */
  disabledApps: string[];
  /** Tips already shown once under the move label. */
  shownTips: string[];
  /** "Keep Both" was chosen when Spectacle was found running, so Split no longer offers to quit it. */
  keepSpectacle: boolean;
}

export interface ViewState {
  settings: Settings;
  /** Action name → default shortcut. */
  defaults: Record<string, string>;
  /** Settings sections in order: [title key, action names]. */
  sections: [string, string[]][];
  /** Whether Split may move other apps' windows (Accessibility on macOS). */
  trusted: boolean;
  /** The Left Half shortcut as shown on screen, empty when turned off; the permission guide suggests trying it. */
  leftHalfShortcut: string;
  /** Actions whose shortcut another app already holds. */
  failures: string[];
  /** The app whose window Split last failed to move, until one of its windows moves again. */
  refusingApp: string | null;
  /** Names of running window apps whose default shortcuts are the same as Split's. */
  conflictingApps: string[];
  version: string;
  platform: "darwin" | "win32" | "linux";
  /** The App Store build has no update check. */
  store: boolean;
  /**
   * macOS desktop settings that make desktops pile up or change order when monitors come and go:
   * "Automatically rearrange Spaces" (reorders) and "Displays have separate Spaces" (separate).
   * Null outside macOS and in the App Store build. The settings page warns when either is on.
   */
  spaces: { reorders: boolean; separate: boolean } | null;
  /** Screen text for the chosen language, already merged over English. */
  strings: Record<string, string>;
  /** BCP 47 tag of that language, for dates and plural rules. */
  locale: string;
}

export type LinkKind = "website" | "help" | "issues" | "accessibility" | "spaces" | "notices";

/** Everything one move label or highlight needs. Rects are in the overlay window's own coordinates. */
export interface OverlayPayload {
  /** "frame": highlight around moved windows; "label": text only; "preview": outline while hovering a menu row. */
  kind: "frame" | "label" | "preview";
  rects: { x: number; y: number; width: number; height: number }[];
  title: string;
  shortcut: string;
  tip: string;
  feedback: FeedbackSettings;
  /** CSS color for "accent", read from the system. */
  accent: string;
  /** Milliseconds the label stays before fading. */
  duration: number;
}

export interface SheetPayload {
  strings: Record<string, string>;
  sections: { title: string; rows: { name: string; keys: string }[] }[];
}

/** What the update window shows; it arrives in the page URL's hash as JSON. */
export interface UpdatePayload {
  title: string;
  body: string;
  /** "What's new" heading and its lines (already in Korean or English). */
  changesTitle: string;
  changes: string[];
  install: string;
  later: string;
  /** True when the window opens before the download is done (a check from the menu). */
  downloading: boolean;
  /** "Downloading… %@%" and "Installing…". */
  downloadingText: string;
  installingText: string;
  /** The system accent color as CSS, or "" to keep the page default. */
  accent: string;
}

/** What the "Save Current Layout" window shows; it arrives in the page URL's hash as JSON. */
export interface LayoutSavePayload {
  kind: "save";
  title: string;
  message: string;
  /** Filled in already ("Layout 3"); also used when the field is left empty. */
  defaultName: string;
  placeholder: string;
  /** "Restore automatically for these monitors", on at first. */
  auto: string;
  save: string;
  cancel: string;
}

/** What the Split Pro window shows; same page as LayoutSavePayload. */
export interface ProPayload {
  kind: "pro";
  title: string;
  features: string;
  monthly: string;
  yearly: string;
  /** The buy button, off until buying opens. */
  comingSoon: string;
  signIn: string;
  restore: string;
  done: string;
  /** "Free until launch", under the buttons. */
  note: string;
}

export type LayoutPagePayload = LayoutSavePayload | ProPayload;

/** The save window's answer; null is Cancel or closing the window. */
export type LayoutSaveAnswer = { name: string; restoresForDisplays: boolean } | null;

/** Download progress in percent, or "ready" once the update can be installed. */
export type UpdateProgress = number | "ready";

export interface SplitApi {
  getState(): Promise<ViewState>;
  saveSettings(settings: Settings): Promise<ViewState>;
  restoreDefaultShortcuts(): Promise<ViewState>;
  /** While recording, Split lets go of its own shortcuts so the keys reach the page. */
  setRecording(recording: boolean): Promise<void>;
  previewFeedback(): Promise<void>;
  openLink(kind: LinkKind): Promise<void>;
  /** Asks macOS for Accessibility access (shows the system prompt the first time). */
  requestTrust(): Promise<boolean>;
  /** The update window's answer: true installs now, false is "Later". */
  answerUpdate(install: boolean): Promise<void>;
  onUpdateProgress(listener: (progress: UpdateProgress) => void): () => void;
  /** The "Save Current Layout" window's answer. */
  answerLayoutSave(answer: LayoutSaveAnswer): Promise<void>;
  /** Opens the Split Pro window as a sheet on the window that asks (the Pro mark was clicked). */
  showPro(): Promise<void>;
  /** Accessibility guide: "Later" closes it; reset clears Split's entry so the switch can be turned on again. */
  guideLater(): Promise<void>;
  guideReset(): Promise<void>;
  /** Called whenever the main process has newer state (permission granted, shortcut failed…). */
  onState(listener: (state: ViewState) => void): () => void;
  onOverlay(listener: (payload: OverlayPayload | null) => void): () => void;
  onSheet(listener: (payload: SheetPayload) => void): () => void;
}

declare global {
  interface Window {
    split: SplitApi;
  }
}
