// The Accessibility guide (SplitAccessibilityGuideController.m): icon, title, the System Settings row
// with the switch to turn on, Later / Open System Settings, and a status line. Once permission
// arrives the window turns into a check mark and the Left Half shortcut to try first.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ViewState } from "../../shared/types";
import "../runners-window.css";
import "./guide.css";

const SPLIT_ICON = new URL("../about/assets/split-icon.png", import.meta.url).href;

function App({ initial }: { initial: ViewState }) {
  const [state, setState] = useState(initial);
  useEffect(() => window.split.onState(setState), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void window.split.guideLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const t = (key: string) => state.strings[key] ?? key;
  if (state.trusted) {
    const keys = state.leftHalfShortcut;
    return (
      <div className="guide">
        <span className="guide-check" aria-hidden="true" />
        <h1>{t("AccessibilityGuide.GrantedTitle")}</h1>
        <p className="guide-description">{t(keys ? "AccessibilityGuide.GrantedTry" : "AccessibilityGuide.GrantedDescription")}</p>
        {keys && (
          <div className="guide-try">
            <span className="guide-halves" aria-hidden="true">
              <i />
              <i />
            </span>
            <span className="guide-keys">
              <span className="guide-keycaps">
                {[...keys].map((key, index) => (
                  <kbd key={index}>{key}</kbd>
                ))}
              </span>
              <span className="guide-key-name">{t("MoveToLeftHalf")}</span>
            </span>
          </div>
        )}
        <div className="buttons">
          <button type="button" className="rw-button default" autoFocus onClick={() => void window.split.guideLater()}>
            {t("Close")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="guide">
      <div className="guide-heading">
        <img className="guide-icon" src={SPLIT_ICON} alt="" draggable={false} />
        <h1>{t("AccessibilityGuide.Title")}</h1>
      </div>
      <p className="guide-description">
        {t("AccessibilityGuide.Description")}
        <br />
        {t("AccessibilityGuide.DescriptionAfter")}
      </p>
      {/* Why: drawn instead of a picture of System Settings, so it reads in every language and
          the switch sits exactly in the middle of its highlight. */}
      <div className="guide-list">
        <p className="guide-list-title">{t("AccessibilityGuide.ListTitle")}</p>
        <div className="guide-row">
          <img src={SPLIT_ICON} alt="" draggable={false} />
          <span>Split</span>
          <span className="guide-switch" aria-hidden="true" />
        </div>
      </div>
      <div className="buttons">
        <button type="button" className="rw-button" onClick={() => void window.split.guideLater()}>
          {t("AccessibilityGuide.ButtonLater")}
        </button>
        <button type="button" className="rw-button default" autoFocus onClick={() => void window.split.openLink("accessibility")}>
          {t("AccessibilityGuide.ButtonOpenSettings")}
        </button>
      </div>
      <p className="status waiting" role="status">
        <span className="status-dot" />
        {t("AccessibilityGuide.StatusWaiting")}
      </p>
      {/* Why: the App Store build can't run tccutil, so the reset link only exists in the direct build. */}
      {!state.store && (
        <button type="button" className="link" onClick={() => void window.split.guideReset()}>
          {t("AccessibilityGuide.ButtonReset")}
        </button>
      )}
    </div>
  );
}

void window.split.getState().then((state) => {
  document.title = state.strings["AccessibilityGuide.WindowTitle"] ?? "Split";
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initial={state} />
    </StrictMode>,
  );
});
