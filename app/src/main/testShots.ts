// Split's screens for the shared test-shot mode (runners/test-shots.ts): RUNNERS_TEST_SHOTS=<folder> opens each
// screen, photographs it in every language and in light and dark, and quits. The order below is the numbering, so
// keep new screens at the end of their group. Rules: ~/git/runners/_docs/[PROGRAM] 시험 촬영 규약.md
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import type { SettingsTab, UpdateOffer } from '../shared/types'
import { currentLanguage, loadLanguage } from './i18n.ts'
import { askUpdate, hideFeedback, hideSheet } from './overlay.ts'
import { askToSaveLayout } from './layouts.ts'
import { hidePanel, showPanelAtPointer } from './trayPanel.ts'
import { releaseNoteLines } from './runners/release-notes.ts'
import { runTestShots, type TestShotPass, type TestShotsConfig } from './runners/test-shots.ts'

export type SplitScreens = {
  showSettings(tab?: SettingsTab, signIn?: boolean): void
  showGuide(): void
  /** Shows the guide's "ready" view, as when permission arrives. */
  showGuideGranted(): void
  showDisplayNotice(): void
  /** The note a shortcut shows on an app that refuses window moves, once its reopen alert was put off. */
  showRefusedNotice(): void
  openSheet(): void
  /** Signs in to the test server (SPLIT_API_URL) as kim@example.com; returns the sign-in problem, or null. */
  signInForTest(password: string): Promise<string | null>
  signOutForTest(): void
  /** Sends the new language's words to the open windows. */
  languageChanged(): void
}

const SETTINGS_TABS: [tab: SettingsTab, screen: string][] = [
  ['shortcuts', '단축키'],
  ['effects', '효과'],
  ['general', '일반'],
  ['account', '계정'],
  ['about', '정보']
]

/** The open window showing `page` (settings, panel, guide, update, overlay, sheet). */
function windowOf(page: string): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(
    (window) => !window.isDestroyed() && window.webContents.getURL().includes(`/${page}.html`)
  )
}

/** Closes the window showing `page` and waits until it is gone. */
async function closeWindowOf(page: string): Promise<void> {
  const window = windowOf(page)
  if (!window) {
    return
  }
  // Why: close() finishes later; reopening the page before 'closed' would reuse the closing window and miss the shot.
  const closed = new Promise<void>((resolve) => window.once('closed', () => resolve()))
  window.close()
  await closed
}

async function evaluate(window: BrowserWindow | undefined, script: string): Promise<unknown> {
  return window ? window.webContents.executeJavaScript(script).catch(() => null) : null
}

/** The update window with this release's notes, as an old version would show it. */
function updateOffer(): UpdateOffer {
  let notes = ''
  try {
    notes = readFileSync(join(app.getAppPath(), '..', 'RELEASE_NOTES.md'), 'utf8')
  } catch {
    // A packaged app has no notes beside it; the window then leaves the box out.
  }
  return {
    version: app.getVersion(),
    notes: releaseNoteLines(notes, currentLanguage().startsWith('ko') ? 'ko' : 'en'),
    downloading: false,
    percent: 100
  }
}

/**
 * Waits until the window shows its words, up to 5 seconds.
 * Why: on a cold start the strings arrive after the first 900 ms, and the first settings shot came out as empty boxes.
 */
async function waitForText(pass: TestShotPass, window: BrowserWindow): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const length = await evaluate(window, `document.body?.innerText.trim().length ?? 0`)
    if (typeof length === 'number' && length > 20) {
      return
    }
    await pass.wait(200)
  }
  pass.note('글자가 5초 안에 안 나옴')
}

async function settingsScenes(pass: TestShotPass, screens: SplitScreens) {
  for (const [tab, name] of SETTINGS_TABS) {
    screens.showSettings(tab)
    await pass.wait(900)
    const window = windowOf('settings')
    if (!window) {
      pass.note(`설정 창 없음: ${name}`)
      continue
    }
    await waitForText(pass, window)
    await pass.shot(window, 'settings', name)
    // Long tabs: the end too, where the last rows and buttons are.
    if (tab === 'shortcuts' || tab === 'general') {
      await evaluate(window, `document.querySelector('.scroll')?.scrollTo(0, 1e6)`)
      await pass.wait(300)
      await pass.shot(window, 'settings', `${name}-끝`)
    }
  }
}

async function menuScenes(pass: TestShotPass) {
  showPanelAtPointer()
  await pass.wait(1200)
  const panel = windowOf('panel')
  if (!panel) {
    pass.note('메뉴 창 없음')
    return
  }
  // Why: the menu's background is macOS vibrancy, which capturePage leaves out (the page is see-through, so it turns
  // black). The kit's own solid background for systems without blur stands in for it in the photos only.
  const translucent = await evaluate(
    panel,
    `(() => { const was = document.documentElement.dataset.translucent ?? null; document.documentElement.dataset.translucent = 'false'; return was })()`
  )
  pass.note('메뉴 바탕은 macOS 반투명이라 사진에는 kit 단색 바탕(data-translucent=false)을 대신 씀')
  // Why: capturePage takes the last drawn frame; without a pause the dark pass came out see-through.
  await pass.wait(300)
  await pass.shot(panel, 'menu', '메뉴')
  await evaluate(
    panel,
    `[...document.querySelectorAll('button[aria-expanded=false]')].forEach((button) => button.click())`
  )
  await pass.wait(700)
  await pass.shot(panel, 'menu', '메뉴-펼침')
  pass.note(
    `자동 모양 칸 수: ${String(
      await evaluate(
        panel,
        `[...document.querySelectorAll('.chip')].pop()?.querySelectorAll('.mini-screen-part').length ?? 0`
      )
    )}`
  )
  await evaluate(
    panel,
    typeof translucent === 'string'
      ? `document.documentElement.dataset.translucent = ${JSON.stringify(translucent)}`
      : `delete document.documentElement.dataset.translucent`
  )
  hidePanel()
}

async function popupScenes(pass: TestShotPass, screens: SplitScreens) {
  screens.showGuide()
  await pass.wait(900)
  const guide = windowOf('guide')
  if (guide) {
    await pass.shot(guide, 'popups', '권한-안내')
    screens.showGuideGranted()
    await pass.wait(900)
    await pass.shot(guide, 'popups', '권한-준비됨')
    await closeWindowOf('guide')
  } else {
    pass.note('권한 안내 창 없음')
  }

  askUpdate(updateOffer(), false)
  await pass.wait(900)
  const update = windowOf('update')
  if (update) {
    await pass.shot(update, 'popups', '업데이트')
  } else {
    pass.note('업데이트 창 없음')
  }
  await closeWindowOf('update')

  screens.showDisplayNotice()
  await pass.wait(700)
  const overlay = windowOf('overlay')
  if (overlay) {
    await pass.shot(overlay, 'popups', '모니터-변경-알림')
  } else {
    pass.note('모니터 변경 알림 없음')
  }
  hideFeedback()

  screens.showSettings('about')
  await pass.wait(700)
  const settings = windowOf('settings')
  const opened = await evaluate(
    settings,
    `(() => { const link = [...document.querySelectorAll('a, button')].find((b) => b.dataset.notices !== undefined || /오픈소스 고지|Open Source Notices/.test(b.innerText)); link?.click(); return Boolean(link) })()`
  )
  await pass.wait(1200)
  if (settings && opened) {
    await pass.shot(settings, 'popups', '오픈소스-고지')
  } else {
    pass.note('오픈소스 고지를 열지 못함')
  }
  await closeWindowOf('settings')
  // The "app refuses to move" warning is a native macOS alert: it has no page to photograph.
  pass.note('창 이동 거부 경고는 macOS 기본 경고 창이라 찍지 않음')

  // Why: closing the window is Cancel, so nothing is saved.
  void askToSaveLayout()
  await pass.wait(900)
  const layout = windowOf('layout')
  if (layout) {
    await pass.shot(layout, 'popups', '배치-저장')
  } else {
    pass.note('배치 저장 창 없음')
  }
  await closeWindowOf('layout')

  // The update window as a check from the menu shows it: a progress bar where the buttons go.
  askUpdate({ ...updateOffer(), downloading: true, percent: 42 }, false)
  await pass.wait(900)
  const progress = windowOf('update')
  if (progress) {
    await pass.shot(progress, 'popups', '업데이트-받는-중')
  } else {
    pass.note('업데이트 창(받는 중) 없음')
  }
  await closeWindowOf('update')

  // The one-time note on the first launch after an install while away, then with its notes opened.
  askUpdate({ ...updateOffer(), installed: true }, false)
  await pass.wait(900)
  const installed = windowOf('update')
  if (installed) {
    await pass.shot(installed, 'popups', '업데이트-됨')
    await evaluate(
      installed,
      `document.querySelector('.update-buttons .rw-button:not(.default)')?.click()`
    )
    await pass.wait(600)
    await pass.shot(installed, 'popups', '업데이트-됨-바뀐-점')
  } else {
    pass.note('업데이트 창(업데이트됨) 없음')
  }
  await closeWindowOf('update')

  screens.showRefusedNotice()
  await pass.wait(700)
  const refused = windowOf('overlay')
  if (refused) {
    await pass.shot(refused, 'popups', '창-이동-거부-알림')
  } else {
    pass.note('창 이동 거부 알림 없음')
  }
  hideFeedback()
}

async function accountScenes(pass: TestShotPass, screens: SplitScreens) {
  screens.showSettings('account', true)
  await pass.wait(1200)
  let window = windowOf('settings')
  if (!window) {
    pass.note('로그인 시트 없음')
    return
  }
  await pass.shot(window, 'account', '로그인-시트')
  await closeWindowOf('settings')

  // Why: signing in sends a password, so only to a local test server (kit 0.1.50 relay-dev answers the nickname API).
  if (!process.env.SPLIT_API_URL) {
    pass.note('시험 서버 없음(SPLIT_API_URL): 로그인한 계정 · 별명 화면은 건너뜀')
    return
  }
  const problem = await screens.signInForTest('split1234')
  if (problem) {
    pass.note(`시험 서버 로그인 실패: ${problem}`)
    return
  }
  screens.showSettings('account')
  await pass.wait(1200)
  window = windowOf('settings')
  if (!window) {
    pass.note('계정 탭 없음')
    return
  }
  const page = (script: string) => evaluate(window, script)
  const fill = (value: string) =>
    page(`(() => {
      const field = document.querySelector('.account-nickname');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
  const row = "document.querySelector('.account-nickname').closest('.row')"
  const save = async (name: string) => {
    await fill(name)
    await page(`${row}.querySelector('button').click()`)
    await pass.wait(900)
  }
  const lines = () =>
    page(
      `[...document.querySelectorAll('.account-text > span')].map((line) => line.textContent).join(' / ') + ' | 설명 줄=' + ${row}.querySelector('.row-hint').textContent`
    )
  pass.note(
    `로그인됨: ${String(await lines())}, 칸 기본 글=${String(await page("document.querySelector('.account-nickname').placeholder"))}`
  )
  await pass.shot(window, 'account', '로그인됨')
  await fill('가'.repeat(31))
  await page(`${row}.querySelector('button').click()`)
  await pass.wait(300)
  pass.note(
    `별명 31자: 알림=${String(await page(`${row}.querySelector('.ra-error')?.textContent ?? '(없음)'`))}, 저장 단추 켜짐=${String(await page(`!${row}.querySelector('button').disabled`))}`
  )
  await pass.shot(window, 'account', '별명-너무김')
  await save('김러너')
  pass.note(`별명 저장(김러너): ${String(await lines())}`)
  await pass.shot(window, 'account', '별명-저장됨')

  showPanelAtPointer()
  await pass.wait(1200)
  const panel = windowOf('panel')
  if (panel) {
    await evaluate(panel, `document.documentElement.dataset.translucent = 'false'`)
    await pass.wait(300)
    pass.note(
      `메뉴 맨 위 줄: ${String(await evaluate(panel, "document.querySelector('.account-line .rm-label')?.textContent"))}`
    )
    await pass.shot(panel, 'account', '메뉴-별명')
  } else {
    pass.note('메뉴 창 없음')
  }
  hidePanel()

  await save('')
  pass.note(`별명 비워 저장: ${String(await lines())}`)
  if (pass.account === 'signed-in') {
    pass.note('RUNNERS_TEST_ACCOUNT=signed-in: 로그인한 채로 둔다')
  } else {
    screens.signOutForTest()
  }
  await closeWindowOf('settings')
}

async function mainScenes(pass: TestShotPass, screens: SplitScreens) {
  screens.openSheet()
  await pass.wait(900)
  const sheet = windowOf('sheet')
  if (sheet) {
    await pass.shot(sheet, 'main', '단축키-목록')
  } else {
    pass.note('단축키 목록 창 없음')
  }
  hideSheet()
}

export async function runSplitTestShots(config: TestShotsConfig, screens: SplitScreens) {
  await runTestShots({
    config,
    app,
    nativeTheme,
    settleMs: 500,
    async setLanguage(lang) {
      loadLanguage([lang])
      // Why: windows read their words when they open; closing them makes every scene open in the new language.
      for (const page of ['settings', 'guide', 'update']) {
        await closeWindowOf(page)
      }
      screens.languageChanged()
    },
    async scenes(pass) {
      // Every group runs even when it is not chosen, so a screen keeps its number; pass.shot skips the photo.
      await settingsScenes(pass, screens)
      await menuScenes(pass)
      await popupScenes(pass, screens)
      await accountScenes(pass, screens)
      await mainScenes(pass, screens)
      await closeWindowOf('settings')
    }
  })
}
