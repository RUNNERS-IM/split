// User settings, kept as Settings.json in the app data folder
// (~/Library/Application Support/Split, %APPDATA%\Split, ~/.config/Split).
//
// On the first launch after the macOS app (2.6.1030 and earlier) Split reads that app's
// UserDefaults and Shortcuts.json once, so nobody loses their shortcuts or effects.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, systemPreferences } from 'electron'
import { ALL, type Action } from '../core/actions.ts'
import { DEFAULT_GAP, GAP_CHOICES } from '../core/geometry.ts'
import { defaultShortcut, KeyCombo } from '../core/shortcuts.ts'
import type { FeedbackSettings, Settings } from '../shared/types'

export const DEFAULT_FEEDBACK: FeedbackSettings = {
  style: 'subtle',
  color: 'accent',
  showShortcut: true,
  duration: 'normal',
  position: 'bottom'
}

export function defaultSettings(): Settings {
  return {
    gap: DEFAULT_GAP,
    launchAtLogin: true,
    showTrayIcon: true,
    autoUpdate: true,
    shortcutSheet: true,
    rearrangeOnDisplayChange: true,
    feedback: { ...DEFAULT_FEEDBACK },
    shortcuts: {},
    disabledApps: [],
    shownTips: [],
    keepSpectacle: false
  }
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'Settings.json')
}

/** The shortcut text in effect for `action`, after defaults. */
export function shortcutText(settings: Settings, action: Action): string | null {
  const value = settings.shortcuts[action]
  return value === undefined ? defaultShortcut(action) : value
}

export function bindings(settings: Settings): [Action, KeyCombo][] {
  const result: [Action, KeyCombo][] = []
  for (const action of ALL) {
    const text = shortcutText(settings, action)
    const combo = text ? KeyCombo.parse(text) : null
    if (combo) {
      result.push([action, combo])
    }
  }
  return result
}

function pick<T>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback
}

/** Keeps values Split knows; anything else goes back to its default. */
export function sanitize(input: Partial<Settings> | null | undefined): Settings {
  const defaults = defaultSettings()
  const raw = input ?? {}
  const feedback = (raw.feedback ?? {}) as Partial<FeedbackSettings>
  const shortcuts: Record<string, string | null> = {}
  for (const [name, value] of Object.entries(raw.shortcuts ?? {})) {
    if (!(ALL as readonly string[]).includes(name)) {
      continue
    }
    if (value === null) {
      shortcuts[name] = null
    } else if (typeof value === 'string' && KeyCombo.parse(value)) {
      shortcuts[name] = KeyCombo.parse(value)!.toText()
    }
  }
  // Why: an action added in a newer version starts with its default keys, unless the person already gave those keys to another action.
  const taken = new Set(Object.values(shortcuts).filter((v): v is string => v !== null))
  for (const action of ALL) {
    const fallback = defaultShortcut(action)
    if (
      shortcuts[action] === undefined &&
      fallback &&
      taken.has(KeyCombo.parse(fallback)!.toText())
    ) {
      shortcuts[action] = null
    }
  }
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  return {
    gap: pick(raw.gap, GAP_CHOICES, defaults.gap),
    launchAtLogin: bool(raw.launchAtLogin, defaults.launchAtLogin),
    showTrayIcon: bool(raw.showTrayIcon, defaults.showTrayIcon),
    autoUpdate: bool(raw.autoUpdate, defaults.autoUpdate),
    shortcutSheet: bool(raw.shortcutSheet, defaults.shortcutSheet),
    rearrangeOnDisplayChange: bool(raw.rearrangeOnDisplayChange, defaults.rearrangeOnDisplayChange),
    feedback: {
      style: pick(feedback.style, ['off', 'subtle', 'strong'] as const, DEFAULT_FEEDBACK.style),
      color: pick(
        feedback.color,
        ['accent', 'blue', 'purple', 'pink', 'orange', 'green', 'gray'] as const,
        DEFAULT_FEEDBACK.color
      ),
      showShortcut: bool(feedback.showShortcut, DEFAULT_FEEDBACK.showShortcut),
      duration: pick(
        feedback.duration,
        ['short', 'normal', 'long'] as const,
        DEFAULT_FEEDBACK.duration
      ),
      position: pick(
        feedback.position,
        ['bottom', 'top', 'center'] as const,
        DEFAULT_FEEDBACK.position
      )
    },
    shortcuts,
    disabledApps: strings(raw.disabledApps),
    shownTips: strings(raw.shownTips),
    keepSpectacle: bool(raw.keepSpectacle, defaults.keepSpectacle)
  }
}

/** Reads the settings; `firstLaunch` is true when there was nothing to read (no file, no macOS app before). */
export function loadSettings(): { settings: Settings; firstLaunch: boolean } {
  const file = settingsFile()
  if (existsSync(file)) {
    try {
      return { settings: sanitize(JSON.parse(readFileSync(file, 'utf8'))), firstLaunch: false }
    } catch {
      return { settings: defaultSettings(), firstLaunch: false }
    }
  }
  const migrated = process.platform === 'darwin' ? fromMacApp() : null
  const settings = migrated ?? defaultSettings()
  saveSettings(settings)
  return { settings, firstLaunch: migrated === null }
}

export function saveSettings(settings: Settings): void {
  const file = settingsFile()
  mkdirSync(dirname(file), { recursive: true })
  // Why: writing next to the file and renaming means a crash mid-write never leaves half a file.
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`)
  renameSync(temp, file)
}

const STYLES = ['off', 'subtle', 'strong'] as const
const DURATIONS = ['short', 'normal', 'long'] as const
const POSITIONS = ['bottom', 'top', 'center'] as const

/** What the macOS app (same bundle id, so the same UserDefaults) had, or null if it never ran here. */
function fromMacApp(): Settings | null {
  const shortcutsFile = join(app.getPath('userData'), 'Shortcuts.json')
  const get = (key: string, type: 'boolean' | 'integer' | 'double' | 'string' | 'array') =>
    systemPreferences.getUserDefault(key, type as 'string') as unknown
  // Why: UserDefaults gives 0 / false for keys that were never set, but stringForKey turns a stored
  // number or bool into "0" / "1", so an empty string means "never set".
  const has = (key: string) => get(key, 'string') !== ''
  const ranBefore =
    existsSync(shortcutsFile) || get('LegacyPreferencesMigrated', 'boolean') === true
  if (!ranBefore) {
    return null
  }
  const settings = defaultSettings()
  try {
    const saved = JSON.parse(readFileSync(shortcutsFile, 'utf8')) as {
      shortcut_name?: string
      shortcut_key_binding?: string | null
    }[]
    for (const item of saved) {
      if (!item.shortcut_name) {
        continue
      }
      settings.shortcuts[item.shortcut_name] = item.shortcut_key_binding ?? null
    }
  } catch {
    // No saved shortcuts: the defaults stay.
  }
  if (has('WindowGap')) {
    settings.gap = get('WindowGap', 'double') as number
  }
  if (has('MoveFeedbackStyle')) {
    settings.feedback.style = STYLES[get('MoveFeedbackStyle', 'integer') as number] ?? 'subtle'
  } else if (get('MoveFeedbackEnabled', 'string') === '0') {
    settings.feedback.style = 'off'
  }
  const color = get('MoveFeedbackColor', 'string')
  if (typeof color === 'string' && color) {
    settings.feedback.color = color as FeedbackSettings['color']
  }
  if (has('MoveFeedbackShowsShortcut')) {
    settings.feedback.showShortcut = get('MoveFeedbackShowsShortcut', 'boolean') as boolean
  }
  if (has('MoveFeedbackDuration')) {
    settings.feedback.duration =
      DURATIONS[get('MoveFeedbackDuration', 'integer') as number] ?? 'normal'
  }
  if (has('MoveFeedbackLabelPosition')) {
    settings.feedback.position =
      POSITIONS[get('MoveFeedbackLabelPosition', 'integer') as number] ?? 'bottom'
  }
  for (const [key, field] of [
    ['StatusItemEnabled', 'showTrayIcon'],
    ['AutomaticUpdateCheckEnabled', 'autoUpdate'],
    ['ShortcutSheetEnabled', 'shortcutSheet'],
    ['RearrangeOnDisplayChange', 'rearrangeOnDisplayChange']
  ] as const) {
    if (has(key)) {
      settings[field] = get(key, 'boolean') as boolean
    }
  }
  const disabled = get('DisabledApplications', 'array')
  if (Array.isArray(disabled)) {
    settings.disabledApps = disabled.filter((v) => typeof v === 'string')
  }
  const tips = get('ShownTips', 'array')
  if (Array.isArray(tips)) {
    settings.shownTips = tips.filter((v) => typeof v === 'string')
  }
  return sanitize(settings)
}
