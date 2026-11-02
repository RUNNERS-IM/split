// Screen text in the 20 languages every RUNNERS app ships. Files are app/locales/<tag>.json;
// values use Cocoa placeholders (%@, %1$@, %ld, %lu) because they came from the macOS .strings.
import { app } from "electron";
import ar from "../../locales/ar.json";
import de from "../../locales/de.json";
import en from "../../locales/en.json";
import es from "../../locales/es.json";
import fi from "../../locales/fi.json";
import fr from "../../locales/fr.json";
import hi from "../../locales/hi.json";
import id from "../../locales/id.json";
import it from "../../locales/it.json";
import ja from "../../locales/ja.json";
import ko from "../../locales/ko.json";
import nl from "../../locales/nl.json";
import pl from "../../locales/pl.json";
import pt from "../../locales/pt.json";
import ru from "../../locales/ru.json";
import th from "../../locales/th.json";
import tr from "../../locales/tr.json";
import vi from "../../locales/vi.json";
import zhHans from "../../locales/zh-Hans.json";
import zhHant from "../../locales/zh-Hant.json";

const TABLES: Record<string, Record<string, string>> = {
  "ar": ar,
  "de": de,
  "en": en,
  "es": es,
  "fi": fi,
  "fr": fr,
  "hi": hi,
  "id": id,
  "it": it,
  "ja": ja,
  "ko": ko,
  "nl": nl,
  "pl": pl,
  "pt": pt,
  "ru": ru,
  "th": th,
  "tr": tr,
  "vi": vi,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

/** Picks the first preferred system language Split has, else English. */
function pickLanguage(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const [language, ...rest] = tag.split("-");
    if (language === "zh") {
      // Why: Taiwan, Hong Kong and Macau read Traditional characters even when the tag has no script.
      const traditional = rest.includes("Hant") || rest.some((part) => ["TW", "HK", "MO"].includes(part));
      return traditional ? "zh-Hant" : "zh-Hans";
    }
    if (TABLES[language]) return language;
  }
  return "en";
}

let language = "en";
let table: Record<string, string> = en;

export function loadLanguage(): void {
  language = pickLanguage(app.getPreferredSystemLanguages());
  table = { ...en, ...TABLES[language] };
}

export function currentLanguage(): string {
  return language;
}

/** Whether the chosen language reads right to left; Arabic is the only one Split ships. */
export function rightToLeft(): boolean {
  return language === "ar";
}

/** Every string for the chosen language, English where a translation is missing. */
export function strings(): Record<string, string> {
  return table;
}

/** Fills Cocoa placeholders: `%@` / `%ld` / `%lu` in order, `%1$@` by position. */
export function format(text: string, ...args: (string | number)[]): string {
  let next = 0;
  return text.replace(/%(?:(\d+)\$)?(@|ld|lu|d)/g, (_match, position: string | undefined) => {
    const value = position ? args[Number(position) - 1] : args[next++];
    return value === undefined ? "" : String(value);
  });
}

/**
 * A key with a number may have a form per plural category as `<key>|one`, `<key>|few` and so on
 * (Intl.PluralRules names); the plain key is the form for the rest. Only the chosen language's own
 * file counts, so "1 window" from English never shows up in a language without a `|one` form.
 */
function pluralKey(key: string, args: (string | number)[]): string {
  const count = args.find((arg) => typeof arg === "number");
  if (count === undefined) return key;
  const own: Record<string, string> | undefined = language === "en" ? en : TABLES[language];
  const tag = language.startsWith("zh") ? "zh" : language;
  const form = `${key}|${new Intl.PluralRules(tag).select(count)}`;
  return own?.[form] ? form : key;
}

export function t(key: string, ...args: (string | number)[]): string {
  const text = table[pluralKey(key, args)] ?? table[key] ?? key;
  if (args.length === 0) return text;
  // Why: in Arabic a filled-in shortcut such as "⌥⌘Z" or an app name keeps its own order when it
  // is set apart (Unicode isolates); otherwise the right-to-left sentence around it reverses it.
  return format(text, ...(rightToLeft() ? args.map((arg) => (typeof arg === "string" ? `\u2066${arg}\u2069` : arg)) : args));
}
