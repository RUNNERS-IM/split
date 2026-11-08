// The "new version" window (one per RUNNERS app, same layout): icon, title, question, a scrolling
// "What's new" box, then Later / Install Now. The main process puts the text in the URL hash.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { UpdatePayload, UpdateProgress } from "../../shared/types";
import "../runners-window.css";
import "./update.css";

const SPLIT_ICON = new URL("../about/assets/split-icon.png", import.meta.url).href;

function readPayload(): UpdatePayload | null {
  try {
    return JSON.parse(decodeURIComponent(location.hash.slice(1))) as UpdatePayload;
  } catch {
    return null;
  }
}

function App({ payload }: { payload: UpdatePayload }) {
  const [progress, setProgress] = useState<UpdateProgress>(payload.downloading ? 0 : "ready");
  const [installing, setInstalling] = useState(false);
  useEffect(() => window.split.onUpdateProgress(setProgress), []);
  // Esc is "Later" once ready; while downloading it only closes, and the download goes on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !installing) void window.split.answerUpdate(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [installing]);
  const ready = progress === "ready";
  const answer = (install: boolean) => {
    // Why: the app closes a moment after this, so the button says what is happening meanwhile.
    if (install) setInstalling(true);
    void window.split.answerUpdate(install);
  };
  return (
    <div className="update">
      <img className="update-icon" src={SPLIT_ICON} alt="" draggable={false} />
      <h1>{payload.title}</h1>
      <p className="update-body">{payload.body}</p>
      {payload.changes.length > 0 && (
        <section className="changes" aria-label={payload.changesTitle}>
          <h2>{payload.changesTitle}</h2>
          {/* Why: the notes are only in Korean or English, so the list stays left-to-right on an Arabic screen. */}
          <ul dir="auto">
            {payload.changes.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {ready ? (
        <div className="buttons">
          <button type="button" className="rw-button" disabled={installing} onClick={() => answer(false)}>
            {payload.later}
          </button>
          <button type="button" className="rw-button default" disabled={installing} onClick={() => answer(true)}>
            {installing ? payload.installingText : payload.install}
          </button>
        </div>
      ) : (
        // Where the buttons go once the download is done (a check from the menu only).
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <span>{payload.downloadingText.replace("%@", String(Math.round(progress)))}</span>
        </div>
      )}
    </div>
  );
}

const payload = readPayload();
if (payload) {
  document.title = payload.title;
  if (payload.accent) document.documentElement.style.setProperty("--rw-accent", payload.accent);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App payload={payload} />
    </StrictMode>,
  );
}
