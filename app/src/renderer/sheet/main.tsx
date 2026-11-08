// The card that lists every Split shortcut with a small picture of where the window goes
// (SplitShortcutSheet in SplitWindowFeedback.m). Shown while ⌥⌘ is held; the main process
// decides when, this page only draws what `onSheet` sends.
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { Maximize2, Minimize2, Redo2, SquareArrowLeft, SquareArrowRight, Undo2 } from "lucide-react";
import type { SheetPayload } from "../../shared/types";
import "../runners-account/runners-window.css";
import "./sheet.css";

type Fraction = [x: number, y: number, width: number, height: number];

/** Part of the screen (from the top-left, 0…1) each action fills. */
const SCREEN_REGIONS: Record<string, Fraction[]> = {
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
    [0.5, 0.5, 0.5, 0.5],
  ],
};

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  MoveToNextDisplay: SquareArrowRight,
  MoveToPreviousDisplay: SquareArrowLeft,
  MakeLarger: Maximize2,
  MakeSmaller: Minimize2,
  UndoLastMove: Undo2,
  RedoLastMove: Redo2,
};

/** A small screen outline with the target part filled, like the tray menu pictures. */
function MiniScreen({ fractions }: { fractions: Fraction[] }) {
  const width = 22;
  const height = 15;
  const outer = { x: 0.75, y: 0.75, width: width - 1.5, height: height - 1.5 };
  const inner = { x: outer.x + 2, y: outer.y + 2, width: outer.width - 4, height: outer.height - 4 };
  const pad = fractions.length > 1 ? 0.6 : 0.4;
  return (
    <svg className="sheet-picture" width={20} height={14} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <rect {...outer} rx={2.5} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.3} />
      {fractions.map(([fx, fy, fw, fh], index) => (
        <rect
          key={index}
          x={inner.x + fx * inner.width + pad}
          y={inner.y + fy * inner.height + pad}
          width={Math.max(0, fw * inner.width - 2 * pad)}
          height={Math.max(0, fh * inner.height - 2 * pad)}
          rx={1.2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

function Picture({ name }: { name: string }) {
  const regions = SCREEN_REGIONS[name];
  if (regions) return <MiniScreen fractions={regions} />;
  const Icon = ICONS[name];
  if (Icon) {
    return (
      <span className="sheet-picture">
        <Icon size={14} strokeWidth={2} />
      </span>
    );
  }
  return <span className="sheet-picture" />;
}

/** Spreads sections over three columns, each going to the shortest column so far. */
function columnsOf(sections: SheetPayload["sections"]): SheetPayload["sections"][] {
  const columns: SheetPayload["sections"][] = [[], [], []];
  const heights = [0, 0, 0];
  for (const section of sections) {
    let target = 0;
    for (let index = 1; index < 3; index++) {
      if (heights[index] < heights[target]) target = index;
    }
    columns[target].push(section);
    heights[target] += section.rows.length + 1;
  }
  return columns.filter((column) => column.length > 0);
}

function Sheet() {
  const [payload, setPayload] = useState<{ value: SheetPayload; key: number } | null>(null);

  useEffect(() => {
    let key = 0;
    return window.split.onSheet((value) => setPayload({ value, key: ++key }));
  }, []);

  if (!payload) return null;
  const { strings, sections } = payload.value;
  // Titles and names may come as string keys ("SectionHalves", "MoveToLeftHalf") or as ready text.
  const text = (key: string) => strings[key] ?? key;
  return (
    <div className="sheet-stage">
      <div key={payload.key} className="sheet">
        <div className="sheet-head">
          <span className="sheet-title">{text("ShortcutSheetTitle")}</span>
          <span className="sheet-hint">{text("ShortcutSheetHint")}</span>
        </div>
        <div className="sheet-grid">
          {columnsOf(sections).map((column, index) => (
            <div key={index} className="sheet-column">
              {column.map((section) => (
                <section key={section.title} className="sheet-section">
                  <h2 className="sheet-section-title">{text(section.title)}</h2>
                  {section.rows.map((row) => (
                    <div key={row.name} className="sheet-row">
                      <Picture name={row.name} />
                      <span className="sheet-name">{text(row.name)}</span>
                      <span className="sheet-keys">{row.keys || "—"}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sheet />
  </StrictMode>,
);
