// The settings window ("Split Settings"): toolbar tabs over 600-point-wide content, the one window of Split besides
// the menu bar panel (shared decision 2026-11-07, Split 1A 2B). The most used screen comes first.
// Everything goes through `window.split`; the main process owns the settings and sends back
// the state after each change.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Keyboard, Settings as SettingsIcon, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import type { Settings, SettingsTab, ViewState } from "../../shared/types.ts";
import { makeStrings, StringsContext } from "./strings.ts";
import AboutTab from "./tabs/AboutTab.tsx";
import AccountTab from "./tabs/AccountTab.tsx";
import GeneralTab from "./tabs/GeneralTab.tsx";
import EffectsTab from "./tabs/EffectsTab.tsx";
import ShortcutsTab from "./tabs/ShortcutsTab.tsx";
import { SignInSheet, type CodePurpose, type SignMode } from "../runners-account/runners-account";

const TABS: { id: SettingsTab; label: string; Icon: LucideIcon }[] = [
  { id: "shortcuts", label: "TabShortcuts", Icon: Keyboard },
  { id: "effects", label: "TabEffects", Icon: Sparkles },
  { id: "general", label: "TabGeneral", Icon: SettingsIcon },
  { id: "account", label: "TabAccount", Icon: UserRound },
  { id: "about", label: "TabAbout", Icon: Info },
];

/** The window is opened on a tab with `?tab=account&signIn=1`, from the panel's account line. */
const OPENED_WITH = new URLSearchParams(location.search);

/** Applies a settings change to the page right away, then saves it in the main process. */
export type Update = (change: (settings: Settings) => Settings) => Promise<void>;

export default function App() {
  const [tab, setTab] = useState<SettingsTab>(TABS.find((t) => t.id === OPENED_WITH.get("tab"))?.id ?? TABS[0].id);
  const [state, setState] = useState<ViewState | null>(null);
  const [signingIn, setSigningIn] = useState(OPENED_WITH.get("signIn") === "1");
  const stateRef = useRef<ViewState | null>(null);
  // Saves can overlap when switches are flipped quickly; only the answer to the newest one
  // is shown, so an older answer never undoes a newer click.
  const saveCount = useRef(0);
  const pendingSaves = useRef(0);

  const show = useCallback((next: ViewState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(
    () =>
      window.split.onSettingsTab((next, signIn) => {
        setTab(next);
        if (signIn) setSigningIn(true);
      }),
    [],
  );

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

  // The shared sheet (runners-app-kit/desktop) closes when this resolves and shows the code it rejects with.
  const signIn = useCallback(
    async (mode: SignMode, email: string, password: string, code?: string) => {
      const answer = await window.split.phoneSignIn(mode, email.trim(), password, code);
      show(answer.state);
      if (answer.error) throw new Error(answer.error);
    },
    [show],
  );
  const sendCode = useCallback(async (purpose: CodePurpose, email: string) => {
    const answer = await window.split.phoneSendCode(purpose, email.trim());
    if (answer.error) throw new Error(answer.error);
  }, []);
  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      const answer = await window.split.phoneResetPassword(email.trim(), code, password);
      show(answer.state);
      if (answer.error) throw new Error(answer.error);
    },
    [show],
  );
  const closeSignIn = useCallback(() => setSigningIn(false), []);

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
        {tab === "account" && (
          <AccountTab state={state} openSignIn={() => setSigningIn(true)} signOut={() => void window.split.phoneSignOut().then(show)} />
        )}
        {tab === "about" && <AboutTab state={state} />}
        {signingIn && (
          <SignInSheet
            lang={state.locale}
            signIn={signIn}
            sendCode={sendCode}
            resetPassword={resetPassword}
            onClose={closeSignIn}
          />
        )}
      </div>
    </StringsContext.Provider>
  );
}
