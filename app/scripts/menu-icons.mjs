// Draws the tray icon frames and the menu row pictures as PNG files in resources/.
// Same drawings as the earlier macOS app; `sips` turns the SVGs into PNGs, so this runs on a Mac
// and the PNGs are committed.
//   node scripts/menu-icons.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const lucide = join(root, 'scripts/lucide')
const work = mkdtempSync(join(tmpdir(), 'split-icons-'))

function png(svg, out, width, height) {
  const file = join(work, 'icon.svg')
  writeFileSync(file, svg)
  for (const [scale, suffix] of [
    [1, ''],
    [2, '@2x']
  ]) {
    execFileSync(
      'sips',
      [
        '-s',
        'format',
        'png',
        '-z',
        String(height * scale),
        String(width * scale),
        file,
        '--out',
        `${out}${suffix}.png`
      ],
      { stdio: 'ignore' }
    )
  }
}

// Fractions of the screen (x, y from the top-left, width, height) for each action.
const regions = {
  MoveToCenter: [[0.25, 0.22, 0.5, 0.56]],
  MoveToFullscreen: [[0, 0, 1, 1]],
  MoveToLeftHalf: [[0, 0, 0.5, 1]],
  MoveToRightHalf: [[0.5, 0, 0.5, 1]],
  MoveToTopHalf: [[0, 0, 1, 0.5]],
  MoveToBottomHalf: [[0, 0.5, 1, 0.5]],
  MoveToUpperLeft: [[0, 0, 0.5, 0.5]],
  MoveToLowerLeft: [[0, 0.5, 0.5, 0.5]],
  MoveToUpperRight: [[0.5, 0, 0.5, 0.5]],
  MoveToLowerRight: [[0.5, 0.5, 0.5, 0.5]],
  MoveToNextThird: [[0.34, 0, 0.32, 1]],
  MoveToPreviousThird: [[0, 0, 0.32, 1]],
  ArrangeWindows: [
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5]
  ]
}

function miniScreen(fractions, w = 22, h = 15) {
  const s = { x: 0.75, y: 0.75, w: w - 1.5, h: h - 1.5 }
  const inner = { x: s.x + 2, y: s.y + 2, w: s.w - 4, h: s.h - 4 }
  const inset = fractions.length > 1 ? 0.6 : 0.4
  const fills = fractions.map(([fx, fy, fw, fh]) => {
    const x = inner.x + fx * inner.w + inset,
      y = inner.y + fy * inner.h + inset
    return `<rect x="${x}" y="${y}" width="${fw * inner.w - 2 * inset}" height="${fh * inner.h - 2 * inset}" rx="1.2"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="2.5" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="1.3"/>
<g fill="#000">${fills.join('')}</g></svg>`
}

for (const [name, fractions] of Object.entries(regions)) {
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="16" viewBox="0 0 22 16"><g transform="translate(0 0.5)">${miniScreen(fractions).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`,
    join(root, 'resources/menu', `${name}Template`),
    22,
    16
  )
}

const icons = {
  MoveToNextDisplay: 'square-arrow-right',
  MoveToPreviousDisplay: 'square-arrow-left',
  MakeLarger: 'maximize-2',
  MakeSmaller: 'minimize-2',
  UndoLastMove: 'undo-2',
  RedoLastMove: 'redo-2',
  settings: 'settings',
  pause: 'circle-pause',
  about: 'info',
  updates: 'refresh-cw',
  help: 'circle-help',
  quit: 'square-x',
  sheet: 'keyboard',
  save: 'save',
  delete: 'trash-2',
  monitor: 'monitor',
  check: 'check',
  sparkles: 'sparkles'
}
for (const [name, icon] of Object.entries(icons)) {
  // Why: NSMenu starts each title right after its own picture, so every picture is 22 pt wide like the
  // screen pictures above; the 16 pt Lucide icon sits in the middle of that width.
  const inner = readFileSync(join(lucide, `${icon}.svg`), 'utf8')
    .replaceAll('currentColor', '#000')
    .replace(/<svg[^>]*>/, (tag) =>
      tag
        .replace(/\swidth="[^"]*"/, ' width="16"')
        .replace(/\sheight="[^"]*"/, ' height="16"')
        .replace('<svg', '<svg x="3" y="0"')
    )
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="16" viewBox="0 0 22 16">${inner}</svg>`,
    join(root, 'resources/menu', `${name}Template`),
    22,
    16
  )
}

// Status item: a screen outline whose inside goes halves → big + two → 2 × 2, sliding between them.
// Halves, big + two, 2 × 2 (top-down, as the flipped image draws them).
const shapes = [
  [
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 1]
  ],
  [
    [0, 0, 0.6, 1],
    [0.6, 0, 0.4, 0.5],
    [0.6, 0.5, 0.4, 0.5]
  ],
  [
    [0, 0, 0.5, 0.5],
    [0.5, 0, 0.5, 0.5],
    [0, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5]
  ]
]
const cellForPane = [
  [0, 1, 1, 0],
  [0, 1, 2, 0],
  [0, 1, 3, 2]
]
const inside = { x: 4.5, y: 6.5, w: 15, h: 11 },
  gap = 1.5
function panes(step) {
  return cellForPane[step].map((cell) => {
    const [fx, fy, fw, fh] = shapes[step][cell]
    return [
      inside.x + fx * (inside.w + gap),
      inside.y + fy * (inside.h + gap),
      fw * (inside.w + gap) - gap,
      fh * (inside.h + gap) - gap
    ]
  })
}
const hold = 1.2,
  slide = 0.35,
  fps = 15,
  step = hold + slide
const frames = Math.round(step * 3 * fps)
for (let f = 0; f < frames; f++) {
  const progress = (f / fps) % (step * 3)
  const index = Math.min(Math.floor(progress / step), 2)
  const from = panes(index),
    to = panes((index + 1) % 3)
  const into = progress - index * step - hold
  const t = into <= 0 ? 0 : (1 - Math.cos(Math.PI * Math.min(into / slide, 1))) / 2
  const rects = from.map((a, i) => a.map((v, k) => v + (to[i][k] - v) * t))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
<rect x="2.5" y="4.5" width="19" height="15" rx="3" fill="none" stroke="#000" stroke-width="2"/>
<g fill="#000">${rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`).join('')}</g></svg>`
  png(svg, join(root, 'resources/tray', `frame${String(f).padStart(2, '0')}Template`), 18, 18)
}
writeFileSync(join(root, 'resources/tray/frames.json'), JSON.stringify({ frames, fps }))
rmSync(work, { recursive: true })
