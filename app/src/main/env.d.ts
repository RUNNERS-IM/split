// Build-time values electron-vite puts into the main bundle (from MAIN_VITE_* in the environment or .env).
// oxlint-disable-next-line typescript/consistent-type-definitions -- adding to the global ImportMeta needs an interface
interface ImportMetaEnv {
  readonly MAIN_VITE_SENTRY_DSN?: string
}

// oxlint-disable-next-line typescript/consistent-type-definitions -- adding to the global ImportMeta needs an interface
interface ImportMeta {
  readonly env: ImportMetaEnv
}
