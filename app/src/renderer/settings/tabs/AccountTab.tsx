// Account tab: the RUNNERS account, and what it does here: the Split phone app arranges this computer's windows
// (src/main/phone.ts). Signed out it offers the shared sign-in sheet; signed in, the account, Sign Out, whether the
// relay is reached and the name the phone lists.
import type { ViewState } from '../../../shared/types.ts'
import { accountText, RunnersMark } from '../../runners-account/runners-account'
import panda from '../../runners-account/assets/panda/face.webp'
import { Button, Card, Row, Section } from '../components.tsx'
import { useStrings } from '../strings.ts'

const PHONE_STATUS_KEYS: Record<Exclude<ViewState['phone']['status'], 'signedOut'>, string> = {
  connecting: 'PhoneConnecting',
  connected: 'PhoneConnected',
  offline: 'PhoneOffline'
}

export default function AccountTab({
  state,
  openSignIn,
  signOut
}: {
  state: ViewState
  openSignIn: () => void
  signOut: () => void
}) {
  const { t } = useStrings()
  const { phone, locale } = state
  const title = accountText(locale, 'title')

  if (phone.status === 'signedOut') {
    return (
      <main className="content scroll">
        <Section title={title} hint={accountText(locale, 'sheetIntro')}>
          <Card>
            <Row
              title={
                <span className="account-line">
                  <RunnersMark size={32} />
                  <span className="account-text">
                    <span>{t('AccountSignInLine')}</span>
                    <span className="account-hint">{t('PhoneHint')}</span>
                  </span>
                </span>
              }
            >
              <Button primary onClick={openSignIn}>
                {t('PhoneSignIn')}
              </Button>
            </Row>
          </Card>
        </Section>
      </main>
    )
  }

  return (
    <main className="content scroll">
      <Section title={title} hint={accountText(locale, 'sheetIntro')}>
        <Card>
          <Row
            title={
              <span className="account-line">
                <span className="ra-badge ra-large" aria-hidden>
                  <img src={panda} alt="" draggable={false} />
                </span>
                <span>{phone.email}</span>
              </span>
            }
          >
            <Button onClick={signOut}>{t('PhoneSignOut')}</Button>
          </Row>
        </Card>
      </Section>
      <Section title={t('PhoneSection')}>
        <Card>
          <Row title={t(PHONE_STATUS_KEYS[phone.status])}>
            <span className={`phone-dot ${phone.status}`} aria-hidden />
          </Row>
          <Row title={t('PhoneDeviceName')} hint={phone.name} />
        </Card>
      </Section>
    </main>
  )
}
