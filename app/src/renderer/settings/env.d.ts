// Lets the settings page import images and CSS the way Vite serves them.
/// <reference types="vite/client" />

// oxlint-disable-next-line typescript/consistent-type-definitions -- adding to the global ImportMeta needs an interface
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string
}
