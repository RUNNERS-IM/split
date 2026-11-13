// The parts of Split that do not touch the operating system: which rectangle a window goes to,
// how far apart windows sit, the auto-arrange layout, undo and redo, and shortcut names.
//
// Every platform layer (Windows, X11, GNOME, KDE) hands the same `Snapshot` in and gets the
// same `Outcome` back, so the windows land on the same places as on macOS.

export * as actions from './actions.ts'
export * as arrange from './arrange.ts'
export * as calc from './calc.ts'
export * as engine from './engine.ts'
export * as geometry from './geometry.ts'
export * as shortcuts from './shortcuts.ts'

export { Action } from './actions.ts'
export {
  Engine,
  type Feedback,
  type Move,
  type Outcome,
  type Screen,
  type Snapshot,
  type WindowInfo
} from './engine.ts'
export { Rect } from './geometry.ts'
