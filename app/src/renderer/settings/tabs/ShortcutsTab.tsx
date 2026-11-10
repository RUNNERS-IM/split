// Shortcuts tab (-makeShortcutsView): one card per section with a recorder per action, a
// scrolling list over a fixed footer with the hints and "Restore Defaults".
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ViewState } from '../../../shared/types.ts'
import type { Update } from '../App.tsx'
import { ActionIcon } from '../ActionIcon.tsx'
import { Alert, Button, Card, Row, Section } from '../components.tsx'
import { displayShortcut, shortcutFor } from '../keys.ts'
import { ShortcutRecorder } from '../ShortcutRecorder.tsx'
import { useStrings } from '../strings.ts'

/** A shortcut that could not be used, shown under the row that tried it. */
type Conflict = {
  action: string
  message: string
  informative: string
}

export default function ShortcutsTab({
  state,
  update,
  show
}: {
  state: ViewState
  update: Update
  show: (state: ViewState) => void
}) {
  const { t, f, has } = useStrings()
  const [recording, setRecordingAction] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  // While recording, Split lets go of its own shortcuts so the keys reach this page.
  const recordingRef = useRef<string | null>(null)
  const startRecording = useCallback((action: string) => {
    setConflict(null)
    recordingRef.current = action
    setRecordingAction(action)
    void window.split.setRecording(true)
  }, [])
  const stopRecording = useCallback(() => {
    if (recordingRef.current === null) {
      return
    }
    recordingRef.current = null
    setRecordingAction(null)
    void window.split.setRecording(false)
  }, [])
  useEffect(() => () => void window.split.setRecording(false), [])

  const record = (action: string, shortcut: string | null) => {
    setConflict(null)
    if (shortcut) {
      const owner = Object.keys(state.defaults).find(
        (other) => other !== action && shortcutFor(state, other) === shortcut
      )
      if (owner) {
        const shown = displayShortcut(shortcut, state.platform)
        setConflict({
          action,
          message: f('AlertMessageTextShortcutValidationError', shown),
          informative: f('AlertInformativeTextShortcutAlreadyInUse', shown)
        })
        return
      }
    }
    void update((s) => ({ ...s, shortcuts: { ...s.shortcuts, [action]: shortcut } }))
  }

  return (
    <div className="shortcuts">
      <main className="content scroll shortcut-list">
        {state.sections.map(([section, actions]) => (
          <Section
            key={section}
            compact
            title={t(section)}
            hint={has(`${section}Hint`) ? t(`${section}Hint`) : undefined}
          >
            <Card>
              {actions.map((action) => (
                <Row
                  key={action}
                  padding={8}
                  title={
                    <span className="shortcut-name">
                      <ActionIcon action={action} />
                      {t(action)}
                    </span>
                  }
                  below={
                    conflict?.action === action && (
                      <div className="conflict" role="alert">
                        <div className="conflict-message">{conflict.message}</div>
                        <div className="conflict-informative">{conflict.informative}</div>
                      </div>
                    )
                  }
                >
                  <ShortcutRecorder
                    label={t(action)}
                    value={shortcutFor(state, action)}
                    platform={state.platform}
                    recording={recording === action}
                    onStart={() => startRecording(action)}
                    onStop={stopRecording}
                    onRecord={(shortcut) => record(action, shortcut)}
                  />
                </Row>
              ))}
            </Card>
          </Section>
        ))}
      </main>
      <footer className="shortcuts-footer">
        <div className="shortcuts-hints">
          <span className="footnote">{t('ShortcutsHint')}</span>
          {state.platform === 'darwin' && (
            <span className="footnote tertiary">{t('ModifierLegend')}</span>
          )}
        </div>
        <div className="row-space" />
        <Button onClick={() => setConfirmRestore(true)}>{t('RestoreDefaults')}</Button>
      </footer>

      {confirmRestore && (
        <Alert
          message={t('AlertMessageTextRestoreDefaults')}
          informative={t('AlertInformativeTextRestoreDefaults')}
          confirmLabel={t('ButtonLabelAffirmative')}
          cancelLabel={t('ButtonLabelNegative')}
          onCancel={() => setConfirmRestore(false)}
          onConfirm={() => {
            setConfirmRestore(false)
            setConflict(null)
            void window.split.restoreDefaultShortcuts().then(show)
          }}
        />
      )}
    </div>
  )
}
