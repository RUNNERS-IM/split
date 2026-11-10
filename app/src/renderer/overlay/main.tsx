// The see-through, click-through page that covers one screen and draws move feedback
// (SplitWindowFeedback.m): the glow around moved windows, the shortcut label, and the outline
// shown while a tray menu row is hovered.
import { StrictMode, useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import type { FeedbackColor, OverlayPayload } from "../../shared/types";
import {
  LABEL_FADE_IN_MS,
  LABEL_FADE_OUT_MS,
  PREVIEW_CORNER_RADIUS,
  PREVIEW_FADE_IN_MS,
  glowMs,
  labelVisibleMs,
  metricsForStyle,
  showsLabel,
  type OverlayMessage,
  type OverlayRect,
} from "./metrics";
import "../runners-account/runners-window.css";
import "./overlay.css";

/** macOS system colors, light then dark appearance. */
const SYSTEM_COLORS: Record<Exclude<FeedbackColor, "accent">, [string, string]> = {
  blue: ["#007aff", "#0a84ff"],
  purple: ["#af52de", "#bf5af2"],
  pink: ["#ff2d55", "#ff375f"],
  orange: ["#ff9500", "#ff9f0a"],
  green: ["#34c759", "#30d158"],
  gray: ["#8e8e93", "#98989d"],
};

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function feedbackColor(payload: OverlayPayload): string {
  const name = payload.feedback.color;
  if (name === "accent") {return "var(--rw-primary)";}
  return SYSTEM_COLORS[name][darkQuery.matches ? 1 : 0];
}

/** `color` at `alpha` (0…1), for any CSS color including the primary variable. */
function withAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/** The default black or white would vanish over a window of the same color; a thin opposite edge keeps it seen. */
const DEFAULT_COLOR_EDGE = ["", "inset "]
  .map((where) => `${where}0 0 0 1px color-mix(in srgb, var(--rw-on-primary) 55%, transparent)`)
  .join(", ");

function inset(rect: OverlayRect, by: number): OverlayRect {
  return { x: rect.x + by, y: rect.y + by, width: Math.max(0, rect.width - 2 * by), height: Math.max(0, rect.height - 2 * by) };
}

function box(rect: OverlayRect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

/** Outline(s) where a window will go while a menu row is hovered. Moves smoothly between rows. */
function Preview({ payload }: { payload: OverlayPayload }) {
  const color = feedbackColor(payload);
  const tiles = payload.rects.length > 1;
  return (
    <div className="preview-layer" style={{ animationDuration: `${PREVIEW_FADE_IN_MS}ms` }}>
      {payload.rects.map((rect, index) => (
        <div
          key={tiles ? `tile-${index}` : "single"}
          className="preview"
          style={{
            ...box(tiles ? inset(rect, 4) : rect),
            borderRadius: PREVIEW_CORNER_RADIUS,
            borderColor: withAlpha(color, 0.95),
            background: withAlpha(color, tiles ? 0.18 : 0.22),
            boxShadow: payload.feedback.color === "accent" ? DEFAULT_COLOR_EDGE : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** A ring around one moved window that grows a little and fades out. */
function Ring({ rect, payload }: { rect: OverlayRect; payload: OverlayPayload }) {
  const ref = useRef<HTMLDivElement>(null);
  const metrics = metricsForStyle(payload.feedback.style);
  useEffect(() => {
    const animation = ref.current?.animate(
      [
        { opacity: metrics.startOpacity, transform: "scale(1)" },
        { opacity: 0, transform: `scale(${metrics.growScale})` },
      ],
      { duration: glowMs(payload), easing: "ease-out", fill: "forwards" },
    );
    return () => animation?.cancel();
  }, [payload, metrics.startOpacity, metrics.growScale]);
  const color = feedbackColor(payload);
  const ringColor = `color-mix(in srgb, ${color} 60%, white)`;
  const glow = withAlpha(color, metrics.shadowOpacity);
  const blur = metrics.shadowRadius * 2;
  const shadows = [`0 0 ${blur}px ${glow}`, `inset 0 0 ${blur}px ${glow}`];
  if (payload.feedback.color === "accent") {shadows.push(DEFAULT_COLOR_EDGE);}
  return (
    <div
      ref={ref}
      className="ring"
      style={{
        ...box(rect),
        borderRadius: PREVIEW_CORNER_RADIUS,
        borderWidth: metrics.borderWidth,
        borderColor: ringColor,
        boxShadow: shadows.join(", "),
        opacity: metrics.startOpacity,
      }}
    />
  );
}

/** The heads-up label: "⌥⌘←   Left Half", with an optional smaller tip line under it. */
function Label({ payload, area }: { payload: OverlayPayload; area: OverlayRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const metrics = metricsForStyle(payload.feedback.style);
  const tipHeight = payload.tip ? metrics.fontSize + 6 : 0;
  const height = metrics.labelHeight + tipHeight;
  const padding = metrics.labelHeight < 40 ? 28 : 40;
  const position = payload.feedback.position;
  const top =
    position === "top"
      ? area.y + 64
      : position === "center"
        ? area.y + area.height / 2 - height / 2
        : area.y + area.height - 64 - height;

  useEffect(() => {
    const visible = labelVisibleMs(payload);
    const total = LABEL_FADE_IN_MS + visible + LABEL_FADE_OUT_MS;
    const animation = ref.current?.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: metrics.labelOpacity, offset: LABEL_FADE_IN_MS / total },
        { opacity: metrics.labelOpacity, offset: (LABEL_FADE_IN_MS + visible) / total },
        { opacity: 0, offset: 1 },
      ],
      { duration: total, fill: "forwards" },
    );
    return () => animation?.cancel();
  }, [payload, metrics.labelOpacity]);

  const shortcut = payload.shortcut;
  return (
    <div
      ref={ref}
      className="label"
      style={{
        left: area.x + area.width / 2,
        top,
        height,
        minWidth: metrics.labelMinWidth,
        paddingInline: padding / 2,
        borderRadius: metrics.labelCornerRadius,
        fontSize: metrics.fontSize,
        opacity: 0,
      }}
    >
      <div className="label-line">
        {shortcut && <span className="label-keys">{shortcut}</span>}
        <span>{payload.title}</span>
      </div>
      {payload.tip && (
        <div className="label-tip" style={{ fontSize: metrics.fontSize - 2 }}>
          {payload.tip}
        </div>
      )}
    </div>
  );
}

function Overlay() {
  const [shown, setShown] = useState<{ message: OverlayMessage; key: number } | null>(null);
  const [, setDark] = useState(darkQuery.matches);

  useEffect(() => {
    let key = 0;
    const stop = window.split.onOverlay((payload) => {
      setShown(payload ? { message: payload as OverlayMessage, key: ++key } : null);
    });
    const onScheme = () => setDark(darkQuery.matches);
    darkQuery.addEventListener("change", onScheme);
    return () => {
      stop();
      darkQuery.removeEventListener("change", onScheme);
    };
  }, []);

  if (!shown) {return null;}
  const { message, key } = shown;
  if (message.kind === "preview") {
    // One element for the whole hover, so moving between menu rows slides the outline.
    return <Preview payload={message} />;
  }
  const area = message.area ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const several = message.rects.length > 1;
  return (
    <div key={key}>
      {message.kind === "frame" &&
        message.feedback.style !== "off" &&
        message.rects.map((rect, index) => <Ring key={index} rect={several ? inset(rect, 3) : rect} payload={message} />)}
      {showsLabel(message) && <Label payload={message} area={area} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
