// Turns on error reports in a Split page. Every page's main.tsx imports this file first.
// Why: the page sends its errors to the main process, which adds the release and the hidden-words list and sends them on,
// so only the DSN is passed here. With no DSN nothing is turned on.
import * as Sentry from '@sentry/electron/renderer'
import { startErrorReport } from './runners-account/error-report.ts'

startErrorReport(Sentry, { dsn: import.meta.env.VITE_SENTRY_DSN })
