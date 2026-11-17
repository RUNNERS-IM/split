// The "new version" window is runners-app-kit's RunnersUpdate, the same in every RUNNERS app, connected here to
// Split's main process (overlay.ts). The words come in the URL hash; the state comes over the preload.
import '../error-report-start.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { splitIcon, splitIconDark } from '../about/split-icon'
import { RunnersUpdate, type RunnersUpdateProps } from '../runners-account/runners-update'
import type { UpdatePageText } from '../../shared/types'
import './update.css'

function readPage(): UpdatePageText {
  try {
    return JSON.parse(decodeURIComponent(location.hash.slice(1))) as UpdatePageText
  } catch {
    return { lang: 'en', rtl: false, text: {} }
  }
}

const page = readPage()
const root = document.documentElement
root.lang = page.lang
root.dir = page.rtl ? 'rtl' : 'ltr'

/** Fills `{{name}}`. Why the isolates: in Arabic a version such as "2.6.111601" would otherwise be read backwards. */
const t: RunnersUpdateProps['t'] = (key, args) =>
  (page.text[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = args?.[name]
    if (value === undefined) {
      return ''
    }
    return page.rtl ? `⁦${value}⁩` : String(value)
  })

const { updateOffer, onUpdateOffer, fitUpdateHeight } = window.split
const answer = (value: 'install' | 'later') => void window.split.answerUpdate(value)

document.title = t('update.title')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RunnersUpdate
      appIcon={splitIcon}
      appIconDark={splitIconDark}
      t={t}
      offer={updateOffer}
      onOffer={onUpdateOffer}
      answer={answer}
      fitHeight={fitUpdateHeight}
    />
  </StrictMode>
)
