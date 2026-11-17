// Split's icon inside its own windows: the white plate on a light screen, the black plate on a dark one.
// Why: the Dock keeps the white plate, but icons drawn inside the app follow the screen's brightness like the other
// RUNNERS apps (runners-wiki 2026-11-11). The kit's update and About windows take the same two files as appIcon and
// appIconDark; the <picture> here is the same one they use (rw-picture in runners-window.css).
import splitIcon from './assets/split-icon.png'
import splitIconDark from './assets/split-icon-dark.png'

export { splitIcon, splitIconDark }

export function SplitIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <picture className="rw-picture">
      <source srcSet={splitIconDark} media="(prefers-color-scheme: dark)" />
      <img
        className={className}
        src={splitIcon}
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
    </picture>
  )
}
