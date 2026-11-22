// Account tab: the RUNNERS account, and what it does here: the Split phone app arranges this computer's windows
// (src/main/phone.ts). Signed out it offers the shared sign-in sheet; signed in, the account, Sign Out, whether the
// relay is reached and the name the phone lists.
import { useEffect, useState } from 'react'
import type { ViewState } from '../../../shared/types.ts'
import { accountText } from '../../runners-account/runners-account'
import panda from '../../runners-account/assets/panda/face.webp'
import signInPanda from '../../runners-account/assets/panda/signin.webp'
import { Button, Card, Row, Section } from '../components.tsx'
import { useStrings } from '../strings.ts'

/** The kit's NICKNAME_MAX. Over it, the row says so before anything goes to the server. */
const NICKNAME_MAX = 30

/**
 * The nickname row, the same as Draw's and Remotrol's Settings › Account (runners-wiki 2026-11-21 별명 칸): every
 * RUNNERS app shows this name and the account server keeps it. Saving it empty goes back to the email's first part.
 */
function NicknameRow({ phone, locale }: { phone: ViewState['phone']; locale: string }) {
  const { t } = useStrings()
  const shown = phone.customNickname ? (phone.nickname ?? '') : ''
  const [draft, setDraft] = useState(shown)
  const [note, setNote] = useState<'idle' | 'saving' | 'saved' | 'long' | 'failed'>('idle')

  // Why: a name fetched from the server after the tab opened fills the field, but not over what is being typed.
  useEffect(() => {
    if (note === 'idle' || note === 'saved') {
      setDraft(shown)
    }
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = draft.trim() !== shown
  const save = () => {
    if (draft.trim().length > NICKNAME_MAX) {
      setNote('long')
      return
    }
    setNote('saving')
    void window.split.phoneSetNickname(draft).then(({ error }) => {
      setNote(error === 'format' ? 'long' : error ? 'failed' : 'saved')
    })
  }
  const problem =
    note === 'long'
      ? t('AccountNicknameLong')
      : note === 'failed'
        ? accountText(locale, 'network')
        : null

  return (
    <Row
      title={t('AccountNickname')}
      hint={
        <span className={problem ? 'ra-error' : undefined}>
          {problem ?? t('AccountNicknameHint')}
        </span>
      }
    >
      <span className="account-nickname-control">
        <input
          className="ra-field account-nickname"
          value={draft}
          maxLength={NICKNAME_MAX + 10}
          placeholder={phone.email?.split('@')[0] ?? ''}
          aria-label={t('AccountNickname')}
          onChange={(event) => {
            setDraft(event.target.value)
            setNote('idle')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && changed) {
              save()
            }
          }}
        />
        <Button disabled={!changed || note === 'saving'} onClick={save}>
          {t(note === 'saved' && !changed ? 'AccountSaved' : 'AccountSave')}
        </Button>
      </span>
    </Row>
  )
}

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
    // Why: the guide's empty screen is a picture, one line and one black button; the panda is the cheerful sign-in one
    // (runners-wiki 2026-11-16 판다 자리 표).
    return (
      <main className="content scroll">
        <Section title={title} hint={accountText(locale, 'sheetIntro')}>
          <div className="account-empty">
            <img className="account-empty-panda" src={signInPanda} alt="" />
            <p className="account-empty-line">{t('PhoneHint')}</p>
            <Button primary onClick={openSignIn}>
              {t('PhoneSignIn')}
            </Button>
          </div>
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
                <span className="account-text">
                  <span>{phone.nickname || phone.email}</span>
                  <span className="row-hint">{phone.email}</span>
                </span>
              </span>
            }
          >
            <Button onClick={signOut}>{t('PhoneSignOut')}</Button>
          </Row>
          <NicknameRow phone={phone} locale={locale} />
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
