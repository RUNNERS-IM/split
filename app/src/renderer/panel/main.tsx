// The tray panel on macOS (src/main/trayPanel.ts): the account line, then the menu lines the main process sends, drawn
// with the shared menu look (runners-menu.css) like Monitor's and Prompt's panels. On/off lines are switches, a line with more under it
// ("Turn Off Shortcuts", "More") opens in place, and the layout card shows monitors, shapes and saved layouts.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronDown, ChevronRight, Command, type LucideIcon } from "lucide-react";
import type { PanelItem, PanelView } from "../../shared/types";
import { RunnersMark } from "../runners-account/runners-account";
import panda from "../runners-account/assets/panda/face.webp";
import "../runners-account/runners-account.css";
import "../runners-account/runners-menu.css";
import "./panel.css";

const ICON_SIZE = 16;
const ICON_STROKE = 1.5;

/** Pictures for the lines the main process sends without one: the shortcuts switch. */
const LINE_ICONS: Record<string, LucideIcon> = { shortcuts: Command };

type Cell = [x: number, y: number, width: number, height: number];

interface LayoutCard {
  titles: { displays: string; shapes: string; saved: string };
  empty: string;
  monitorImage: string;
  checkImage: string;
  selected: string;
  screens: { id: string; name: string; detail: string; auto: Cell[] }[];
  shapes: { id: string; label: string; cells?: Cell[]; auto?: boolean }[];
  saved: { id: string; label: string; cells: Cell[]; toolTip?: string }[];
}

function Picture({ item }: { item: { name?: string; image?: string; template?: boolean } }) {
  const Glyph = item.name ? LINE_ICONS[item.name] : undefined;
  if (Glyph) return <Glyph size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />;
  if (!item.image) return <span className="picture" aria-hidden />;
  // Why: template pictures are black shapes; as a mask they take the text colour in light and dark mode.
  if (item.template) return <span className="picture template" style={{ maskImage: `url(${item.image})`, WebkitMaskImage: `url(${item.image})` }} aria-hidden />;
  return <img className="picture" src={item.image} alt="" />;
}

/** A small screen outline with its parts filled (or only outlined, for "Auto"), like the shapes in the menu. */
function MiniScreen({ cells, outline }: { cells: Cell[]; outline?: boolean }) {
  const width = 34;
  const height = 22;
  const inner = { x: 3, y: 3, width: width - 6, height: height - 6 };
  return (
    <svg className="mini-screen" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <rect x={0.75} y={0.75} width={width - 1.5} height={height - 1.5} rx={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {cells.map(([x, y, w, h], index) => (
        <rect
          key={index}
          x={inner.x + x * inner.width + 0.8}
          y={inner.y + y * inner.height + 0.8}
          width={Math.max(0, w * inner.width - 1.6)}
          height={Math.max(0, h * inner.height - 1.6)}
          rx={1.5}
          fill={outline ? "none" : "currentColor"}
          stroke={outline ? "currentColor" : "none"}
          strokeWidth={outline ? 1.2 : 0}
        />
      ))}
    </svg>
  );
}

function Layouts({ card }: { card: LayoutCard }) {
  const [selected, setSelected] = useState(card.selected);
  useEffect(() => setSelected(card.selected), [card.selected]);
  const screen = card.screens.find((s) => s.id === selected) ?? card.screens[0];
  return (
    <>
      {card.screens.length > 1 ? (
        <div className="rm-group">
          <div className="rm-heading">{card.titles.displays}</div>
          {card.screens.map((s) => (
            <button type="button" key={s.id} className="rm-item two-line" aria-selected={s.id === screen?.id} onClick={() => setSelected(s.id)}>
              <span className="picture template" style={{ maskImage: `url(data:image/png;base64,${card.monitorImage})`, WebkitMaskImage: `url(data:image/png;base64,${card.monitorImage})` }} aria-hidden />
              <span className="rm-label">
                {s.name}
                <span className="rm-sub">{s.detail}</span>
              </span>
              {s.id === screen?.id ? (
                <span className="rm-trailing accent">
                  <Check size={16} strokeWidth={2} aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="rm-group">
        <div className="rm-heading">{card.titles.shapes}</div>
        <div className="chips">
          {card.shapes.map((shape) => (
            <button type="button" key={shape.id} className="chip" onClick={() => screen && void window.split.panelChoose(`${shape.id}\t${screen.id}`)}>
              <MiniScreen cells={shape.auto ? (screen?.auto ?? []) : (shape.cells ?? [])} outline={shape.auto} />
              <span>{shape.label}</span>
            </button>
          ))}
        </div>
        <div className="rm-heading saved-heading">{card.titles.saved}</div>
        {card.saved.length === 0 ? (
          <div className="rm-note">{card.empty}</div>
        ) : (
          <div className="chips">
            {card.saved.map((layout) => (
              <button type="button" key={layout.id} className="chip" title={layout.toolTip} onClick={() => void window.split.panelChoose(layout.id)}>
                <MiniScreen cells={layout.cells} />
                <span>{layout.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** The top line, the same in Monitor's panel: the RUNNERS account. It opens Settings' Account tab, with the sign-in sheet when signed out. */
function AccountLine({ account }: { account: PanelView["account"] }) {
  const { email } = account;
  return (
    <button type="button" className="rm-item account-line" onClick={() => void window.split.panelSettings("account", !email)}>
      {email ? (
        <span className="ra-badge account-badge" aria-hidden>
          <img src={panda} alt="" draggable={false} />
        </span>
      ) : (
        <span className="account-mark" aria-hidden>
          <RunnersMark size={16} />
        </span>
      )}
      <span className="rm-label">{email ?? account.signInLine}</span>
      <span className="rm-trailing">
        {email && account.status !== "connected" ? <span className="account-status">{account.connecting}</span> : null}
        <ChevronRight size={14} strokeWidth={ICON_STROKE} className="chevron" aria-hidden />
      </span>
    </button>
  );
}

function Lines({ items, open, toggle, run }: { items: PanelItem[]; open: Set<string>; toggle: (id: string) => void; run: (id: string) => void }) {
  const out: ReactNode[] = [];
  items.forEach((item, index) => {
    const key = `${index}:${item.kind}`;
    switch (item.kind) {
      case "separator":
        out.push(<div key={key} className="rm-separator" />);
        break;
      case "heading":
        out.push(<div key={key} className="rm-heading">{item.label}</div>);
        break;
      case "layouts":
        out.push(<Layouts key={key} card={item.card as LayoutCard} />);
        break;
      case "switch":
        out.push(
          <label key={key} className={`rm-item rm-switch${item.enabled ? "" : " disabled"}`} title={item.toolTip}>
            <Picture item={item} />
            <span className="rm-label">{item.label}</span>
            <input type="checkbox" checked={item.on} disabled={!item.enabled} onChange={() => run(item.id)} />
            <span className="rm-knob" aria-hidden />
          </label>,
        );
        break;
      case "group": {
        const expanded = open.has(item.id);
        const Chevron = item.name === "more" ? ChevronDown : ChevronRight;
        out.push(
          <button key={key} type="button" className={`rm-item group${expanded ? " expanded" : ""}`} aria-expanded={expanded} disabled={!item.enabled} onClick={() => toggle(item.id)}>
            {item.name === "more" ? <Chevron size={ICON_SIZE} strokeWidth={ICON_STROKE} className="chevron" aria-hidden /> : <Picture item={item} />}
            <span className="rm-label">{item.label}</span>
            {item.name === "more" ? null : (
              <span className="rm-trailing">
                <ChevronRight size={14} strokeWidth={ICON_STROKE} className="chevron" aria-hidden />
              </span>
            )}
          </button>,
        );
        if (expanded) {
          out.push(
            <div key={`${key}:items`} className={item.name === "more" ? "folded" : "submenu"}>
              <Lines items={item.items} open={open} toggle={toggle} run={run} />
            </div>,
          );
        }
        break;
      }
      case "item":
        out.push(
          <button key={key} type="button" className="rm-item" disabled={!item.enabled || !item.id} title={item.toolTip} onClick={() => run(item.id)}>
            <Picture item={item} />
            <span className="rm-label">
              {item.label}
              {item.sublabel ? <span className="rm-sub">{item.sublabel}</span> : null}
            </span>
            {item.pill ? <span className="pill">{item.pill}</span> : null}
            {item.checked || item.shortcut ? (
              <span className="rm-trailing">
                {item.checked ? <Check size={16} strokeWidth={2} className="accent" aria-hidden /> : null}
                {/* Why: on an Arabic line the keys would otherwise read backwards (A⇧⌘). */}
                {item.shortcut ? <span className="shortcut"><bdi>{item.shortcut}</bdi></span> : null}
              </span>
            ) : null}
          </button>,
        );
        break;
    }
  });
  return <>{out}</>;
}

function Panel() {
  const [view, setView] = useState<PanelView | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    void window.split.panelView().then(setView);
    // Why: every open starts folded and reads the lines anew (monitors, pause state and switches change meanwhile).
    const stop = window.split.onPanelShown((next) => {
      setOpen(new Set());
      setView(next);
      ref.current?.scrollTo(0, 0);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.split.panelClose();
      else if (event.key === "," && event.metaKey) void window.split.panelSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Why: the window follows the menu's height; the main process keeps it inside the screen, and the page scrolls when it is cut.
  useLayoutEffect(() => {
    const node = ref.current?.firstElementChild;
    if (!node) return;
    const observer = new ResizeObserver(() => window.split.panelFit(Math.ceil(node.getBoundingClientRect().height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const run = (id: string) =>
    void window.split.panelRun(id).then((next) => {
      if (next) setView(next);
    });

  return (
    <main ref={ref} className="scroller">
      <div className="panel">
        {view ? (
          <>
            <AccountLine account={view.account} />
            <Lines items={view.items} open={open} toggle={toggle} run={run} />
          </>
        ) : null}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Panel />
  </StrictMode>,
);
