// Phone tab: the RUNNERS account lets the Split phone app arrange this computer's windows
// (src/main/phone.ts). Signed out it shows one Sign In button that opens the shared sign-in sheet;
// signed in, whether the relay is reached and the name the phone lists. The account itself and
// Log Out are in the badge at the window's top right (runners-app-kit/desktop, the same in all four apps).
import type { ViewState } from "../../../shared/types.ts";
import { Button, Card, Row, Section } from "../components.tsx";
import { useStrings } from "../strings.ts";

export const PHONE_STATUS_KEYS: Record<Exclude<ViewState["phone"]["status"], "signedOut">, string> = {
  connecting: "PhoneConnecting",
  connected: "PhoneConnected",
  offline: "PhoneOffline",
};

export default function PhoneTab({ state, openSignIn }: { state: ViewState; openSignIn: () => void }) {
  const { t } = useStrings();
  const { phone } = state;

  if (phone.status === "signedOut") {
    return (
      <main className="content scroll">
        <Section title={t("PhoneSection")} hint={t("PhoneHint")}>
          <div className="phone-sign-in">
            <Button primary onClick={openSignIn}>
              {t("PhoneSignIn")}
            </Button>
          </div>
        </Section>
      </main>
    );
  }

  return (
    <main className="content scroll">
      <Section title={t("PhoneSection")} hint={t("PhoneHint")}>
        <Card>
          <Row title={phone.email ?? ""} hint={t(PHONE_STATUS_KEYS[phone.status])}>
            <span className={`phone-dot ${phone.status}`} aria-hidden />
          </Row>
          <Row title={t("PhoneDeviceName")} hint={phone.name} />
        </Card>
      </Section>
    </main>
  );
}
