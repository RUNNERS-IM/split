// Two small windows of the Layouts feature, one page (the main process puts the text in the URL hash):
// - "Save Current Layout": icon, title, text, a name field and the "restore for these monitors"
//   box, the "open apps" box with its Pro mark, then Cancel / Save. Same order as the NSAlert in SplitLayoutMenu.m.
// - Split Pro: what it adds and costs, with buying not open yet. Same order as SplitPro.m.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { LayoutPagePayload, LayoutSavePayload, ProPayload } from '../../shared/types'
import '../runners-account/runners-window.css'
import '../update/update.css'
import './layout.css'

const SPLIT_ICON = new URL('../about/assets/split-icon.png', import.meta.url).href

function readPayload(): LayoutPagePayload | null {
  try {
    return JSON.parse(decodeURIComponent(location.hash.slice(1))) as LayoutPagePayload
  } catch {
    return null
  }
}

/** Esc does what the cancel button does. */
function useEscape(run: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])
}

function Save({ payload }: { payload: LayoutSavePayload }) {
  const [name, setName] = useState(payload.defaultName)
  const [auto, setAuto] = useState(true)
  const [openApps, setOpenApps] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.select(), [])
  const cancel = () => void window.split.answerLayoutSave(null)
  useEscape(cancel)
  return (
    <form
      className="update layout"
      onSubmit={(event) => {
        event.preventDefault()
        void window.split.answerLayoutSave({ name, restoresForDisplays: auto, opensApps: openApps })
      }}
    >
      <img className="update-icon" src={SPLIT_ICON} alt="" draggable={false} />
      <h1>{payload.title}</h1>
      <p className="update-body">{payload.message}</p>
      <div className="layout-fields">
        <input
          ref={field}
          type="text"
          value={name}
          placeholder={payload.placeholder}
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="layout-auto">
          <label>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => setAuto(event.target.checked)}
            />
            <span>{payload.auto}</span>
          </label>
          {payload.openApps && (
            <div className="layout-pro-row">
              <label>
                <input
                  type="checkbox"
                  checked={openApps}
                  disabled={payload.openAppsLocked}
                  onChange={(event) => setOpenApps(event.target.checked)}
                />
                <span>{payload.openApps}</span>
              </label>
              {/* Shows what Pro is; the box itself is locked only once buying opens and Pro is not bought. */}
              <button
                type="button"
                className="pro-pill"
                title="Split Pro"
                onClick={() => void window.split.showPro()}
              >
                Pro
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="buttons">
        <button type="button" className="rw-button" onClick={cancel}>
          {payload.cancel}
        </button>
        <button type="submit" className="rw-button default">
          {payload.save}
        </button>
      </div>
    </form>
  )
}

function Pro({ payload }: { payload: ProPayload }) {
  const close = () => window.close()
  useEscape(close)
  return (
    <div className="update pro">
      <img className="update-icon" src={SPLIT_ICON} alt="" draggable={false} />
      <h1 className="pro-title">{payload.title}</h1>
      <p className="pro-features">{payload.features}</p>
      <div className="pro-prices">
        <span>{payload.monthly}</span>
        <span>{payload.yearly}</span>
      </div>
      <div className="buttons pro-buy">
        <button type="button" className="rw-button" disabled>
          {payload.comingSoon}
        </button>
      </div>
      <div className="buttons pro-buttons">
        <button type="button" className="rw-button" disabled>
          {payload.signIn}
        </button>
        <button type="button" className="rw-button" disabled>
          {payload.restore}
        </button>
        <button type="button" className="rw-button default" autoFocus onClick={close}>
          {payload.done}
        </button>
      </div>
      <p className="pro-note">{payload.note}</p>
    </div>
  )
}

const payload = readPayload()
if (payload) {
  document.title = payload.title
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {payload.kind === 'pro' ? <Pro payload={payload} /> : <Save payload={payload} />}
    </StrictMode>
  )
}
