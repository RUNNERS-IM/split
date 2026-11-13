// Screen text for the settings page. The main process sends every string already in the chosen
// language (ViewState.strings); values keep the Cocoa placeholders of the macOS app.
import { createContext, useContext } from 'react'

/**
 * Fills Cocoa-style placeholders: `%@`, `%ld`, `%lu`, `%d`, `%s` take the next argument in order,
 * `%1$@` (and `%2$ld`…) take that argument by position, `%%` is a plain percent sign.
 */
export function format(text: string, ...args: (string | number)[]): string {
  let next = 0
  return text.replace(
    /%%|%(?:(\d+)\$)?(?:@|l{0,2}[dui]|s|f)/g,
    (match, position: string | undefined) => {
      if (match === '%%') {
        return '%'
      }
      const index = position ? Number(position) - 1 : next++
      const value = args[index]
      return value === undefined ? '' : String(value)
    }
  )
}

export type Strings = {
  /** The text for `key`, or the key itself when the language file has no such line. */
  t(key: string): string
  /** `t(key)` with its placeholders filled. */
  f(key: string, ...args: (string | number)[]): string
  /** Whether the language file has `key` at all, for optional hints. */
  has(key: string): boolean
}

export function makeStrings(table: Record<string, string>): Strings {
  const t = (key: string) => table[key] ?? key
  return {
    t,
    f: (key, ...args) => format(t(key), ...args),
    has: (key) => typeof table[key] === 'string' && table[key].length > 0
  }
}

export const StringsContext = createContext<Strings>(makeStrings({}))

export function useStrings(): Strings {
  return useContext(StringsContext)
}
