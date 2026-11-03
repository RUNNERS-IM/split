// The settings window ("Split Settings"), a re-creation of SplitPreferencesController.m:
// toolbar tabs General / Effects / Shortcuts over 600-point-wide content.
// Everything goes through `window.split`; the main process owns the settings and sends back
// the state after each change.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Settings as SettingsIcon, Smartphone, Sparkles, type LucideIcon } from "lucide-react";
import type { Settings, ViewState } from "../../shared/types.ts";
import { makeStrings, StringsContext } from "./strings.ts";
import GeneralTab from "./tabs/GeneralTab.tsx";
import EffectsTab from "./tabs/EffectsTab.tsx";
import ShortcutsTab from "./tabs/ShortcutsTab.tsx";
import PhoneTab from "./tabs/PhoneTab.tsx";

type Tab = "general" | "effects" | "shortcuts" | "phone";

/** Same order and icons as the Mac toolbar, then the phone app's sign-in. */
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "general", label: "TabGeneral", Icon: SettingsIcon },
  { id: "effects", label: "TabEffects", Icon: Sparkles },
  { id: "shortcuts", label: "TabShortcuts", Icon: Keyboard },
  { id: "phone", label: "TabPhone", Icon: Smartphone },
];

/** Applies a settings change to the page right away, then saves it in the main process. */
export type Update = (change: (settings: Settings) => Settings) => Promise<void>;

export default function App() {
  const [tab, setTab] = useState<Tab>("general");
  const [state, setState] = useState<ViewState | null>(null);
  const stateRef = useRef<ViewState | null>(null);
  // Saves can overlap when switches are flipped quickly; only the answer to the newest one
  // is shown, so an older answer never undoes a newer click.
  const saveCount = useRef(0);
  const pendingSaves = useRef(0);

  const show = useCallback((next: ViewState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let alive = true;
    window.split.getState().then((first) => alive && show(first));
    const stop = window.split.onState((next) => {
      const current = stateRef.current;
      // While a save is on its way, keep what was just clicked and take the rest.
      show(pendingSaves.current > 0 && current ? { ...next, settings: current.settings } : next);
    });
    // Accessibility can be turned on in System Settings while this window is in the back.
    const refresh = () => window.split.getState().then((next) => pendingSaves.current === 0 && show(next));
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      stop();
      window.removeEventListener("focus", refresh);
    };
  }, [show]);

  // Like the Mac window, check the Accessibility permission every second while it is still off.
  const waitingForTrust = state !== null && state.platform === "darwin" && !state.trusted;
  useEffect(() => {
    if (!waitingForTrust) {
      return;
    }
    const timer = window.setInterval(() => {
      void window.split.getState().then((next) => pendingSaves.current === 0 && show(next));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitingForTrust, show]);

  const strings = useMemo(() => makeStrings(state?.strings ?? {}), [state?.strings]);

  useEffect(() => {
    if (!state) {
      return;
    }
    document.title = strings.t("SettingsWindowTitle");
    document.documentElement.lang = state.locale;
    document.documentElement.dataset.platform = state.platform;
  }, [state?.locale, state?.platform, strings]);

  const update = useCallback<Update>(
    async (change) => {
      const current = stateRef.current;
      if (!current) {
        return;
      }
      const settings = change(current.settings);
      show({ ...current, settings });
      const mine = ++saveCount.current;
      pendingSaves.current += 1;
      try {
        const saved = await window.split.saveSettings(settings);
        if (mine === saveCount.current) {
          show(saved);
        }
      } finally {
        pendingSaves.current -= 1;
      }
    },
    [show],
  );

  if (!state) {
    return null;
  }

  return (
    <StringsContext.Provider value={strings}>
      <div className="window">
        {state.platform === "darwin" && <header className="titlebar">{strings.t("SettingsWindowTitle")}</header>}
        <nav className="toolbar" role="tablist" aria-label={strings.t("SettingsWindowTitle")}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "toolbar-item selected" : "toolbar-item"}
              onClick={() => setTab(id)}
            >
              <Icon size={22} strokeWidth={1.5} aria-hidden />
              <span>{strings.t(label)}</span>
            </button>
          ))}
        </nav>
        {tab === "general" && <GeneralTab state={state} update={update} />}
        {tab === "effects" && <EffectsTab state={state} update={update} />}
        {tab === "shortcuts" && <ShortcutsTab state={state} update={update} show={show} />}
        {tab === "phone" && <PhoneTab state={state} show={show} />}
      </div>
    </StringsContext.Provider>
  );
}
