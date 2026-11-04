/**
 * "Open at login" starts on for everyone who installs Split directly (decided default on).
 *
 * It is applied once per Mac, marked by a file, so turning it off later sticks. The first run used to be
 * "no settings file yet", which skipped people who came from the macOS app (their settings were moved over),
 * so they stayed off without ever choosing it. Now the stored choice decides: it is true unless the person
 * turned the switch off in this app, so only a real "off" is kept.
 *
 * The App Store build never turns it on by itself: Apple asks for the person's consent first (guideline 2.4.5).
 */
export interface LoginDefaultInput {
  /** The one-time default was applied on this Mac before. */
  applied: boolean;
  /** App Store build. */
  store: boolean;
  /** What the settings say the person wants. */
  wanted: boolean;
  /** Whether the login item is registered right now. */
  on: boolean;
}

export function shouldTurnOnAtLogin({ applied, store, wanted, on }: LoginDefaultInput): boolean {
  if (applied || store) return false;
  return wanted && !on;
}
