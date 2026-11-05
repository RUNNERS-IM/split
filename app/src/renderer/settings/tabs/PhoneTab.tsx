// Phone tab: signs in with a RUNNERS account so the Split phone app can arrange this computer's
// windows (src/main/phone.ts). Signed out it shows the sign-in form; signed in, the account,
// whether the relay is reached, and the name the phone lists.
import { useState } from "react";
import type { ViewState } from "../../../shared/types.ts";
import { Button, Card, Row, Section } from "../components.tsx";
import { useStrings } from "../strings.ts";

const STATUS_KEYS = {
  connecting: "PhoneConnecting",
  connected: "PhoneConnected",
  offline: "PhoneOffline",
} as const;

export default function PhoneTab({ state, show }: { state: ViewState; show: (state: ViewState) => void }) {
  const { t } = useStrings();
  const { phone } = state;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await window.split.phoneSignIn(email.trim(), password);
      setError(answer.error);
      if (!answer.error) setPassword("");
      show(answer.state);
    } finally {
      setBusy(false);
    }
  };

  if (phone.status === "signedOut") {
    return (
      <main className="content scroll">
        <Section title={t("PhoneSection")} hint={t("PhoneHint")}>
          <Card>
            <form
              className="phone-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <input
                type="email"
                autoComplete="username"
                placeholder={t("PhoneEmail")}
                aria-label={t("PhoneEmail")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t("PhonePassword")}
                aria-label={t("PhonePassword")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {error && <p className="phone-error">{t(error)}</p>}
              <div className="phone-actions">
                <Button primary onClick={() => void submit()} disabled={busy || !email.trim() || !password}>
                  {t("PhoneSignIn")}
                </Button>
              </div>
              <button type="submit" hidden />
            </form>
          </Card>
        </Section>
      </main>
    );
  }

  return (
    <main className="content scroll">
      <Section title={t("PhoneSection")} hint={t("PhoneHint")}>
        <Card>
          <Row title={phone.email ?? ""} hint={t(STATUS_KEYS[phone.status])}>
            <span className={`phone-dot ${phone.status}`} aria-hidden />
          </Row>
          <Row title={t("PhoneDeviceName")} hint={phone.name} />
          <Row title={t("PhoneSignOutTitle")}>
            <Button small onClick={() => void window.split.phoneSignOut().then(show)}>
              {t("PhoneSignOut")}
            </Button>
          </Row>
        </Card>
      </Section>
    </main>
  );
}
