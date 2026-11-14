// Turns on crash and error reports (Sentry) before anything else in main runs, so errors during start-up are caught too.
// index.ts imports this file first. The shared rules (what is sent, what is hidden) live in runners/error-report.ts from runners-app-kit.
// Why: with no DSN (development runs and builds made before the DSN secret exists) startErrorReport does nothing and nothing is sent.
import { hostname, userInfo } from 'node:os'
import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import { startErrorReport } from './runners/error-report.ts'

startErrorReport(Sentry, {
  dsn: import.meta.env.MAIN_VITE_SENTRY_DSN,
  release: `split@${app.getVersion()}`,
  environment: app.isPackaged ? 'production' : 'development',
  hide: [hostname(), userInfo().username]
})
