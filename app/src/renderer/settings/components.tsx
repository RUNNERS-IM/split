// Building blocks shaped like the macOS settings window (SplitPreferencesController.m): rounded
// cards with rows split by thin lines, small switches and segmented controls, small push buttons,
// and an in-page alert that stands in for NSAlert.
import { Children, Fragment, useEffect, type CSSProperties, type ReactNode } from 'react'
import iconUrl from '../about/assets/split-icon.png'

/** A rounded group like the ones in System Settings. Rows are separated by thin lines. */
export function Card({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <div className="card">
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <div className="card-separator" />}
          {row}
        </Fragment>
      ))}
    </div>
  )
}

/** A gray section title (11pt semibold) over a card, with an optional lighter hint line. */
export function Section({
  title,
  hint,
  compact,
  children
}: {
  title?: string
  hint?: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section className={compact ? 'section compact' : 'section'}>
      {title && (
        <header className="section-header">
          <h2 className="section-title">{title}</h2>
          {hint && <p className="section-hint">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * One row inside a card: text on the left, a control on the right. `textWidth` is how wide the
 * hint may wrap, as in the Mac code (card width minus padding minus the control's room).
 */
export function Row({
  title,
  hint,
  textWidth,
  disabled,
  padding,
  children,
  below
}: {
  title: ReactNode
  hint?: ReactNode
  textWidth?: number
  disabled?: boolean
  /** Space above and below; 13 by default, 8 for shortcut rows. */
  padding?: number
  children?: ReactNode
  /** Extra lines under the row, full width (the shortcut conflict message). */
  below?: ReactNode
}) {
  const style =
    padding === undefined ? undefined : ({ '--row-padding': `${padding}px` } as CSSProperties)
  return (
    <div className={disabled ? 'row disabled' : 'row'} style={style}>
      <div className="row-line">
        <div className="row-text" style={textWidth ? { maxWidth: textWidth } : undefined}>
          <div className="row-title">{title}</div>
          {hint && <div className="row-hint">{hint}</div>}
        </div>
        <div className="row-space" />
        {children && <div className="row-control">{children}</div>}
      </div>
      {below}
    </div>
  )
}

/** The on/off switch every RUNNERS app shares (26 × 16, see settings.css). */
export function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={checked ? 'switch on' : 'switch'}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

/** A small segmented control that selects one of its segments. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div
      className={disabled ? 'segmented disabled' : 'segmented'}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          className={option.value === value ? 'selected' : undefined}
          onClick={() => option.value !== value && onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A push button; `small` is NSControlSizeSmall, `primary` the blue default button. */
export function Button({
  children,
  onClick,
  small,
  primary,
  disabled,
  autoFocus
}: {
  children: ReactNode
  onClick: () => void
  small?: boolean
  primary?: boolean
  disabled?: boolean
  autoFocus?: boolean
}) {
  const classes = ['button', small ? 'small' : '', primary ? 'primary' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  )
}

/** The app icon, as the Mac About line and alerts show it. */
export function AppIcon({ size }: { size: number }) {
  return (
    <img className="app-icon" src={iconUrl} width={size} height={size} alt="" draggable={false} />
  )
}

/**
 * An alert drawn inside the page in place of NSAlert: icon, bold message, smaller informative
 * text, and buttons. Escape answers Cancel (or OK when there is no Cancel), Return answers OK.
 */
export function Alert({
  message,
  informative,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: {
  message: string
  informative?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        ;(onCancel ?? onConfirm)()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return (
    <div className="alert-backdrop" role="presentation">
      <div className="alert" role="alertdialog" aria-modal="true" aria-label={message}>
        <AppIcon size={56} />
        <div className="alert-message">{message}</div>
        {informative && <div className="alert-informative">{informative}</div>}
        <div className="alert-buttons">
          {cancelLabel && onCancel && <Button onClick={onCancel}>{cancelLabel}</Button>}
          <Button primary onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
