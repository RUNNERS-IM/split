// The small picture in front of each shortcut row, as SplitMenuImageForShortcutName draws it:
// a tiny screen with the part the window goes to filled in, or a Lucide icon for the actions
// that are not a place on the screen.
import {
  Maximize2,
  Minimize2,
  Redo2,
  SquareArrowLeft,
  SquareArrowRight,
  Undo2,
  type LucideIcon
} from 'lucide-react'

type Fraction = [x: number, y: number, width: number, height: number]

/** Fractions of the screen (x, y from the top-left, width, height) for each shortcut. */
const REGIONS: Record<string, Fraction[]> = {
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
  // One big window on the left and two stacked on the right, like three arranged windows.
  ArrangeWindows: [
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5]
  ]
}

const ICONS: Record<string, LucideIcon> = {
  MoveToNextDisplay: SquareArrowRight,
  MoveToPreviousDisplay: SquareArrowLeft,
  MakeLarger: Maximize2,
  MakeSmaller: Minimize2,
  UndoLastMove: Undo2,
  RedoLastMove: Redo2
}

const WIDTH = 22
const HEIGHT = 15

function MiniScreen({ fractions }: { fractions: Fraction[] }) {
  const screen = { x: 0.75, y: 0.75, width: WIDTH - 1.5, height: HEIGHT - 1.5 }
  const inner = {
    x: screen.x + 2,
    y: screen.y + 2,
    width: screen.width - 4,
    height: screen.height - 4
  }
  const inset = fractions.length > 1 ? 0.6 : 0.4
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden>
      <rect
        {...screen}
        rx={2.5}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={1.3}
      />
      {fractions.map(([x, y, width, height], index) => (
        <rect
          key={index}
          x={inner.x + x * inner.width + inset}
          y={inner.y + y * inner.height + inset}
          width={Math.max(0, width * inner.width - 2 * inset)}
          height={Math.max(0, height * inner.height - 2 * inset)}
          rx={1.2}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

export function ActionIcon({ action }: { action: string }) {
  const fractions = REGIONS[action]
  const Icon = ICONS[action]
  return (
    <span className="action-icon">
      {fractions ? (
        <MiniScreen fractions={fractions} />
      ) : Icon ? (
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      ) : null}
    </span>
  )
}
