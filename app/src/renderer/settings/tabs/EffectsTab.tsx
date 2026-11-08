// Effects tab (-makeEffectsView): how moved windows are highlighted. Every change plays the
// effect around this window right away, as "Try It" does.
import type {
  FeedbackColor,
  FeedbackDuration,
  FeedbackPosition,
  FeedbackSettings,
  FeedbackStyle,
  ViewState,
} from "../../../shared/types.ts";
import type { Update } from "../App.tsx";
import {
  Button,
  Card,
  Row,
  Section,
  Segmented,
  Switch,
} from "../components.tsx";
import { useStrings } from "../strings.ts";

const TEXT_WIDTH = 544 - 32 - 240;
// Why: a switch takes far less room than the segmented controls, so its hint can stay on one line.
const SWITCH_TEXT_WIDTH = 544 - 32 - 70;

const STYLES: { value: FeedbackStyle; label: string }[] = [
  { value: "off", label: "FeedbackOff" },
  { value: "subtle", label: "FeedbackSubtle" },
  { value: "strong", label: "FeedbackStrong" },
];
const COLORS: FeedbackColor[] = [
  "accent",
  "blue",
  "purple",
  "pink",
  "orange",
  "green",
  "gray",
];
const DURATIONS: { value: FeedbackDuration; label: string }[] = [
  { value: "short", label: "DurationShort" },
  { value: "normal", label: "DurationNormal" },
  { value: "long", label: "DurationLong" },
];
const POSITIONS: { value: FeedbackPosition; label: string }[] = [
  { value: "bottom", label: "PositionBottom" },
  { value: "top", label: "PositionTop" },
  { value: "center", label: "PositionCenter" },
];

/** A round color button; "accent" is a color wheel because it follows the system accent color. */
function Swatch({
  color,
  chosen,
  disabled,
  label,
  onChoose,
}: {
  color: FeedbackColor;
  chosen: boolean;
  disabled: boolean;
  label: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={
        chosen ? `swatch chosen swatch-${color}` : `swatch swatch-${color}`
      }
      onClick={onChoose}
    >
      <span className="swatch-dot" />
    </button>
  );
}

export default function EffectsTab({
  state,
  update,
}: {
  state: ViewState;
  update: Update;
}) {
  const { t } = useStrings();
  const feedback = state.settings.feedback;
  const enabled = feedback.style !== "off";
  const positionEnabled = enabled && feedback.showShortcut;

  const change = (patch: Partial<FeedbackSettings>) => {
    const next = { ...feedback, ...patch };
    void update((s) => ({ ...s, feedback: { ...s.feedback, ...patch } })).then(
      () => {
        if (next.style !== "off") {
          void window.split.previewFeedback();
        }
      },
    );
  };

  const options = <T extends string>(list: { value: T; label: string }[]) =>
    list.map((o) => ({ value: o.value, label: t(o.label) }));

  return (
    <main className="content scroll effects">
      <Section title={t("SectionMoveFeedback")}>
        <Card>
          <Row
            title={t("MoveFeedback")}
            hint={t("MoveFeedbackHint")}
            textWidth={TEXT_WIDTH}
          >
            <Segmented
              label={t("MoveFeedback")}
              value={feedback.style}
              options={options(STYLES)}
              onChange={(style) => change({ style })}
            />
          </Row>
          <Row
            title={t("FeedbackColor")}
            hint={t("FeedbackColorHint")}
            textWidth={TEXT_WIDTH}
            disabled={!enabled}
          >
            <div
              className="swatches"
              role="radiogroup"
              aria-label={t("FeedbackColor")}
            >
              {COLORS.map((color) => (
                <Swatch
                  key={color}
                  color={color}
                  chosen={feedback.color === color}
                  disabled={!enabled}
                  label={t(`Color_${color}`)}
                  onChoose={() => change({ color })}
                />
              ))}
            </div>
          </Row>
          <Row
            title={t("FeedbackShortcut")}
            hint={t("FeedbackShortcutHint")}
            textWidth={SWITCH_TEXT_WIDTH}
            disabled={!enabled}
          >
            <Switch
              label={t("FeedbackShortcut")}
              checked={feedback.showShortcut}
              disabled={!enabled}
              onChange={(showShortcut) => change({ showShortcut })}
            />
          </Row>
          <Row
            title={t("FeedbackDuration")}
            textWidth={TEXT_WIDTH}
            disabled={!enabled}
          >
            <Segmented
              label={t("FeedbackDuration")}
              value={feedback.duration}
              options={options(DURATIONS)}
              disabled={!enabled}
              onChange={(duration) => change({ duration })}
            />
          </Row>
          <Row
            title={t("FeedbackPosition")}
            textWidth={TEXT_WIDTH}
            disabled={!positionEnabled}
          >
            <Segmented
              label={t("FeedbackPosition")}
              value={feedback.position}
              options={options(POSITIONS)}
              disabled={!positionEnabled}
              onChange={(position) => change({ position })}
            />
          </Row>
        </Card>
      </Section>
      <div className="footer-line">
        <span className="footnote">{t("FeedbackTryHint")}</span>
        <div className="row-space" />
        <Button
          small
          disabled={!enabled}
          onClick={() => void window.split.previewFeedback()}
        >
          {t("FeedbackTry")}
        </Button>
      </div>
    </main>
  );
}
