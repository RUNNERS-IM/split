// Glow and label measurements from SplitWindowFeedback.m, shared by the overlay page (drawing)
// and the main process (when to hide the overlay window). No DOM or Node here.
import type { FeedbackDuration, FeedbackStyle, OverlayPayload } from "../../shared/types";

export type FeedbackMetrics = {
  borderWidth: number;
  shadowRadius: number;
  shadowOpacity: number;
  startOpacity: number;
  growScale: number;
  /** Seconds the glow takes to grow and fade, before the duration setting. */
  glowDuration: number;
  fontSize: number;
  labelHeight: number;
  labelMinWidth: number;
  labelCornerRadius: number;
  labelOpacity: number;
  /** Seconds the label stays, before the duration setting. */
  labelVisibleDuration: number;
}

/** Strong is how Split 1.1 looked; Subtle (and Off, which never draws) is the quieter default. */
export function metricsForStyle(style: FeedbackStyle): FeedbackMetrics {
  if (style === "strong") {
    return {
      borderWidth: 2.5, shadowRadius: 10, shadowOpacity: 0.9, startOpacity: 1, growScale: 1.03, glowDuration: 0.65,
      fontSize: 15, labelHeight: 44, labelMinWidth: 180, labelCornerRadius: 14, labelOpacity: 1, labelVisibleDuration: 0.9,
    };
  }
  return {
    borderWidth: 1.5, shadowRadius: 4, shadowOpacity: 0.5, startOpacity: 0.6, growScale: 1, glowDuration: 0.4,
    fontSize: 13, labelHeight: 32, labelMinWidth: 0, labelCornerRadius: 10, labelOpacity: 0.85, labelVisibleDuration: 0.6,
  };
}

export function durationScale(duration: FeedbackDuration): number {
  return duration === "short" ? 0.6 : duration === "long" ? 1.6 : 1;
}

/** Corner radius of the preview outline and the glow ring. */
export const PREVIEW_CORNER_RADIUS = 12;
/** Fade times in milliseconds. */
export const LABEL_FADE_IN_MS = 120;
export const LABEL_FADE_OUT_MS = 250;
export const PREVIEW_FADE_IN_MS = 120;
export const PREVIEW_MOVE_MS = 180;

/**
 * `OverlayPayload.duration` is the macOS `DurationScale()` in milliseconds: short 600, normal 1000,
 * long 1600. Everything below is scaled by it the same way the macOS app does.
 */
export function durationMs(duration: FeedbackDuration): number {
  return durationScale(duration) * 1000;
}

/** Milliseconds the move label stays before fading; a tip needs a moment longer to read. */
export function labelVisibleMs(payload: Pick<OverlayPayload, "feedback" | "tip" | "duration">): number {
  const metrics = metricsForStyle(payload.feedback.style);
  return Math.round(metrics.labelVisibleDuration * payload.duration + (payload.tip ? 1600 : 0));
}

/** Milliseconds the glow takes to grow and fade. */
export function glowMs(payload: Pick<OverlayPayload, "feedback" | "duration">): number {
  return Math.round(metricsForStyle(payload.feedback.style).glowDuration * payload.duration);
}

/** Whether the page draws the text label for this payload. */
export function showsLabel(payload: Pick<OverlayPayload, "kind" | "title" | "feedback">): boolean {
  if (payload.kind === "label") {return payload.title.length > 0;}
  return payload.kind === "frame" && payload.feedback.showShortcut && payload.title.length > 0;
}

/** Milliseconds until everything the page draws for this payload has faded out; null for a preview, which stays. */
export function overlayLifetime(payload: OverlayPayload): number | null {
  if (payload.kind === "preview") {return null;}
  const glow = payload.kind === "frame" && payload.rects.length > 0 ? glowMs(payload) : 0;
  const label = showsLabel(payload) ? LABEL_FADE_IN_MS + labelVisibleMs(payload) + LABEL_FADE_OUT_MS : 0;
  return Math.max(glow, label);
}

export type OverlayRect = OverlayPayload["rects"][number];

/**
 * What the main process actually sends: the contract's payload plus the screen's usable area
 * (without menu bar and Dock/taskbar) in window coordinates, where the label is placed like the
 * macOS app places it. Pages without `area` use the whole window.
 */
export type OverlayMessage = OverlayPayload & { area?: OverlayRect };
