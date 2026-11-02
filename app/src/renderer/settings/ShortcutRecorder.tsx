// The shortcut field of the Shortcuts tab, after SplitShortcutRecorder.m: 168 × 24, the shortcut
// in the middle and a round × on the right to clear it. Click it and it waits for keys ("Type
// shortcut"), showing the modifiers held so far; Escape stops without changing anything, and while
// waiting the right badge either stops (no shortcut yet) or keeps the current one.
import { useEffect, useState } from "react";
import { useStrings } from "./strings.ts";
import { displayShortcut, modifierLabel, shortcutFromEvent, type Platform } from "./keys.ts";

function ClearBadge() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
      <circle cx="6.5" cy="6.5" r="6.5" fill="currentColor" />
      <path d="M4 4 9 9M9 4 4 9" stroke="var(--window)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The curved "put back" arrow the Mac recorder draws while recording over an existing shortcut. */
function RevertBadge() {
  return (
    <svg width="13" height="13" viewBox="0 0 1 1" aria-hidden>
      <path
        fill="currentColor"
        d="M0.049 0.382 L0.409 0.053 L0.409 0.277 C0.409 0.277 0.837 0.251 0.851 0.516 C0.868 0.845 0.551 0.947 0.551 0.947 C0.551 0.947 0.746 0.809 0.742 0.661 C0.738 0.507 0.409 0.485 0.409 0.485 L0.409 0.735 Z"
      />
    </svg>
  );
}

export function ShortcutRecorder({
  label,
  value,
  platform,
  recording,
  onStart,
  onStop,
  onRecord,
}: {
  /** The action's name, for screen readers. */
  label: string;
  value: string | null;
  platform: Platform;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  /** A new shortcut, or null to clear it. */
  onRecord: (shortcut: string | null) => void;
}) {
  const { t } = useStrings();
  const [held, setHeld] = useState("");
  const [overBadge, setOverBadge] = useState(false);

  useEffect(() => {
    if (!recording) {
      setHeld("");
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "keyup") {
        setHeld(modifierLabel({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, logo: event.metaKey }, platform));
        return;
      }
      const modifiers = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
      if (event.key === "Escape" && !modifiers) {
        onStop();
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (shortcut) {
        onStop();
        onRecord(shortcut);
        return;
      }
      setHeld(modifierLabel({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, logo: event.metaKey }, platform));
    };
    // The window losing focus ends recording, as clicking elsewhere does on the Mac.
    const onBlur = () => onStop();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, platform, onStop, onRecord]);

  let text: string;
  // Keys stay left to right in Arabic too; "⌥⌘←" alone has no letter to set its direction.
  let keys = false;
  if (recording && held) {
    text = held;
    keys = true;
  } else if (recording && !overBadge) {
    text = t("ShortcutRecorderLabelEnterShortcut");
  } else if (recording) {
    text = t(value ? "ShortcutRecorderLabelUseExisting" : "ShortcutRecorderLabelStopRecording");
  } else if (value) {
    text = displayShortcut(value, platform);
    keys = true;
  } else {
    text = t("ShortcutRecorderLabelClickToRecord");
  }

  const badge = recording || value;
  const classes = ["recorder", recording ? "recording" : "", value || recording ? "" : "empty"].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <button
        type="button"
        className="recorder-field"
        aria-label={label}
        aria-pressed={recording}
        onClick={() => (recording ? onStop() : onStart())}
      >
        <span className="recorder-label" dir={keys ? "ltr" : undefined}>
          {text}
        </span>
      </button>
      {badge && (
        <button
          type="button"
          className="recorder-badge"
          tabIndex={-1}
          aria-label={
            recording
              ? t(value ? "ShortcutRecorderLabelUseExisting" : "ShortcutRecorderLabelStopRecording")
              : t("ShortcutsHint")
          }
          onMouseEnter={() => setOverBadge(true)}
          onMouseLeave={() => setOverBadge(false)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOverBadge(false);
            if (recording) {
              onStop();
            } else {
              onRecord(null);
            }
          }}
        >
          {recording && value ? <RevertBadge /> : <ClearBadge />}
        </button>
      )}
    </div>
  );
}
