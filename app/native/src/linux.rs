//! Linux X11 sessions (any window manager that follows EWMH: GNOME on Xorg, KDE on X11, Xfce,
//! Cinnamon, MATE, i3…): windows are read and moved through the EWMH properties and messages,
//! monitors come from RandR.
//!
//! Wayland lets no app move another app's window, so there Split reports that it cannot.

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::randr::ConnectionExt as _;
use x11rb::protocol::xproto::{
    AtomEnum, ClientMessageEvent, ConnectionExt as _, EventMask, KeyButMask, Window as XWindow,
};
use x11rb::rust_connection::RustConnection;

use crate::{AppInfo, Event, Move, Rect, Screen, Snapshot, Window};

x11rb::atom_manager! {
    Atoms: AtomsCookie {
        _NET_ACTIVE_WINDOW,
        _NET_CLIENT_LIST,
        _NET_CLIENT_LIST_STACKING,
        _NET_CURRENT_DESKTOP,
        _NET_WORKAREA,
        _NET_WM_DESKTOP,
        _NET_WM_NAME,
        _NET_WM_PID,
        _NET_WM_STATE,
        _NET_WM_STATE_HIDDEN,
        _NET_WM_STATE_SKIP_TASKBAR,
        _NET_WM_STATE_MAXIMIZED_VERT,
        _NET_WM_STATE_MAXIMIZED_HORZ,
        _NET_WM_STATE_FULLSCREEN,
        _NET_WM_WINDOW_TYPE,
        _NET_WM_WINDOW_TYPE_NORMAL,
        _NET_WM_STRUT,
        _NET_WM_STRUT_PARTIAL,
        _NET_FRAME_EXTENTS,
        _GTK_FRAME_EXTENTS,
        _NET_MOVERESIZE_WINDOW,
        UTF8_STRING,
        WM_CLASS,
    }
}

struct X11 {
    connection: RustConnection,
    root: XWindow,
    root_size: (f64, f64),
    atoms: Atoms,
}

static X: OnceLock<Result<X11, String>> = OnceLock::new();
type Sink = Box<dyn Fn(Event) + Send + Sync>;

static SINK: Mutex<Option<Sink>> = Mutex::new(None);

fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t.eq_ignore_ascii_case("wayland"))
}

fn x11() -> Result<&'static X11, String> {
    X.get_or_init(|| {
        // Why: under Wayland, DISPLAY points at XWayland, which only sees X11 apps; moving those
        // alone would look broken, so Wayland is reported as unsupported instead.
        if is_wayland() {
            return Err("Wayland does not let apps move other apps' windows".into());
        }
        let (connection, screen_number) = x11rb::connect(None).map_err(error)?;
        let screen = &connection.setup().roots[screen_number];
        let root = screen.root;
        let root_size = (
            screen.width_in_pixels as f64,
            screen.height_in_pixels as f64,
        );
        let atoms = Atoms::new(&connection)
            .map_err(error)?
            .reply()
            .map_err(error)?;
        Ok(X11 {
            connection,
            root,
            root_size,
            atoms,
        })
    })
    .as_ref()
    .map_err(Clone::clone)
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

fn intersection(a: &Rect, b: &Rect) -> Option<Rect> {
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let max_x = (a.x + a.width).min(b.x + b.width);
    let max_y = (a.y + a.height).min(b.y + b.height);
    (max_x > x && max_y > y).then(|| rect(x, y, max_x - x, max_y - y))
}

impl X11 {
    fn cardinals(&self, window: XWindow, property: u32) -> Vec<u32> {
        self.connection
            .get_property(false, window, property, AtomEnum::ANY, 0, 1024)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().map(|v| v.collect()))
            .unwrap_or_default()
    }

    fn bytes(&self, window: XWindow, property: u32, kind: impl Into<u32>) -> Vec<u8> {
        self.connection
            .get_property(false, window, property, kind, 0, 1024)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.value)
            .unwrap_or_default()
    }

    /// WM_CLASS is "instance\0class\0"; the class names the program, for example `firefox`.
    fn app_of(&self, window: XWindow) -> AppInfo {
        let bytes = self.bytes(window, self.atoms.WM_CLASS, AtomEnum::STRING);
        let parts: Vec<&[u8]> = bytes.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
        let class =
            String::from_utf8_lossy(parts.get(1).or(parts.first()).copied().unwrap_or_default())
                .into_owned();
        AppInfo {
            id: class.to_lowercase(),
            name: class,
        }
    }

    fn title_of(&self, window: XWindow) -> String {
        let name = self.bytes(window, self.atoms._NET_WM_NAME, self.atoms.UTF8_STRING);
        if !name.is_empty() {
            return String::from_utf8_lossy(&name).into_owned();
        }
        String::from_utf8_lossy(&self.bytes(window, u32::from(AtomEnum::WM_NAME), AtomEnum::STRING))
            .into_owned()
    }

    /// left, right, top, bottom
    fn extents(&self, window: XWindow, property: u32) -> [f64; 4] {
        let values = self.cardinals(window, property);
        if values.len() >= 4 {
            [
                values[0] as f64,
                values[1] as f64,
                values[2] as f64,
                values[3] as f64,
            ]
        } else {
            [0.0; 4]
        }
    }

    /// The window as people see it: the client area plus the window manager's frame, minus the
    /// invisible shadow GTK draws around client-side decorated windows.
    fn visible_rect(&self, window: XWindow) -> Option<Rect> {
        let geometry = self.connection.get_geometry(window).ok()?.reply().ok()?;
        let origin = self
            .connection
            .translate_coordinates(window, self.root, 0, 0)
            .ok()?
            .reply()
            .ok()?;
        let frame = self.extents(window, self.atoms._NET_FRAME_EXTENTS);
        let shadow = self.extents(window, self.atoms._GTK_FRAME_EXTENTS);
        Some(rect(
            origin.dst_x as f64 - frame[0] + shadow[0],
            origin.dst_y as f64 - frame[2] + shadow[2],
            geometry.width as f64 + frame[0] + frame[1] - shadow[0] - shadow[1],
            geometry.height as f64 + frame[2] + frame[3] - shadow[2] - shadow[3],
        ))
    }

    fn is_own(&self, window: XWindow) -> bool {
        self.cardinals(window, self.atoms._NET_WM_PID)
            .first()
            .copied()
            == Some(std::process::id())
    }

    fn info(&self, window: XWindow) -> Option<Window> {
        if window == 0 || window == self.root || self.is_own(window) {
            return None;
        }
        let app = self.app_of(window);
        Some(Window {
            id: window,
            rect: self.visible_rect(window)?,
            app: app.name,
            bundle: app.id,
            title: self.title_of(window),
        })
    }

    fn active(&self) -> XWindow {
        self.cardinals(self.root, self.atoms._NET_ACTIVE_WINDOW)
            .first()
            .copied()
            .unwrap_or(0)
    }

    fn current_desktop(&self) -> u32 {
        self.cardinals(self.root, self.atoms._NET_CURRENT_DESKTOP)
            .first()
            .copied()
            .unwrap_or(0)
    }

    fn is_ordinary(&self, window: XWindow, desktop: u32) -> bool {
        let types = self.cardinals(window, self.atoms._NET_WM_WINDOW_TYPE);
        if !types.is_empty() && !types.contains(&self.atoms._NET_WM_WINDOW_TYPE_NORMAL) {
            return false;
        }
        let state = self.cardinals(window, self.atoms._NET_WM_STATE);
        if state.contains(&self.atoms._NET_WM_STATE_HIDDEN)
            || state.contains(&self.atoms._NET_WM_STATE_SKIP_TASKBAR)
        {
            return false;
        }
        match self.cardinals(window, self.atoms._NET_WM_DESKTOP).first() {
            Some(&d) => d == desktop || d == 0xFFFF_FFFF,
            None => true,
        }
    }

    fn screens(&self) -> Vec<Screen> {
        let mut screens: Vec<Screen> = self
            .connection
            .randr_get_monitors(self.root, true)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| {
                r.monitors
                    .iter()
                    .map(|m| {
                        let frame = rect(m.x as f64, m.y as f64, m.width as f64, m.height as f64);
                        // Why: the output name (DP-1, HDMI-1) stays with the port the monitor is plugged into.
                        let id = self
                            .connection
                            .get_atom_name(m.name)
                            .ok()
                            .and_then(|c| c.reply().ok())
                            .map(|n| String::from_utf8_lossy(&n.name).into_owned())
                            .unwrap_or_else(|| format!("{},{}", m.x, m.y));
                        Screen {
                            frame,
                            work_area: frame,
                            scale: 1.0,
                            primary: m.primary,
                            id,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();
        if screens.is_empty() {
            let frame = rect(0.0, 0.0, self.root_size.0, self.root_size.1);
            screens.push(Screen {
                frame,
                work_area: frame,
                scale: 1.0,
                primary: true,
                id: "screen".into(),
            });
        }
        if !screens.iter().any(|s| s.primary) {
            screens[0].primary = true;
        }

        // _NET_WORKAREA is one rect for all monitors together. Use it where it fits a monitor
        // well; struts below take care of panels on single monitors.
        let workareas = self.cardinals(self.root, self.atoms._NET_WORKAREA);
        let index = self.current_desktop() as usize * 4;
        let workarea = workareas
            .get(index..index + 4)
            .or_else(|| workareas.get(0..4))
            .map(|v| rect(v[0] as f64, v[1] as f64, v[2] as f64, v[3] as f64));
        for screen in &mut screens {
            if let Some(area) = workarea.and_then(|w| intersection(&w, &screen.frame))
                && area.width * area.height >= screen.frame.width * screen.frame.height * 0.5
            {
                screen.work_area = area;
            }
        }
        for strut in self.struts() {
            for screen in &mut screens {
                apply_strut(screen, &strut, self.root_size);
            }
        }
        screens
    }

    /// Panels and docks reserve screen edges with _NET_WM_STRUT_PARTIAL (or the older _NET_WM_STRUT).
    fn struts(&self) -> Vec<[f64; 12]> {
        let mut windows = self
            .connection
            .query_tree(self.root)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.children)
            .unwrap_or_default();
        windows.extend(self.cardinals(self.root, self.atoms._NET_CLIENT_LIST));
        windows.sort_unstable();
        windows.dedup();
        let mut struts = Vec::new();
        for window in windows {
            let partial = self.cardinals(window, self.atoms._NET_WM_STRUT_PARTIAL);
            if partial.len() >= 12 {
                let mut s = [0.0; 12];
                for (i, v) in partial.iter().take(12).enumerate() {
                    s[i] = *v as f64;
                }
                struts.push(s);
                continue;
            }
            let simple = self.cardinals(window, self.atoms._NET_WM_STRUT);
            if simple.len() >= 4 {
                let (w, h) = self.root_size;
                struts.push([
                    simple[0] as f64,
                    simple[1] as f64,
                    simple[2] as f64,
                    simple[3] as f64,
                    0.0,
                    h,
                    0.0,
                    h,
                    0.0,
                    w,
                    0.0,
                    w,
                ]);
            }
        }
        struts
    }

    fn send_to_root(&self, window: XWindow, message: u32, data: [u32; 5]) -> Result<(), String> {
        let event = ClientMessageEvent::new(32, window, message, data);
        self.connection
            .send_event(
                false,
                self.root,
                EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                event,
            )
            .map_err(error)?;
        Ok(())
    }

    /// The modifier keys held right now, from the pointer query (it carries the keyboard state too).
    fn modifier_flags(&self) -> u32 {
        let Some(mask) = self
            .connection
            .query_pointer(self.root)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.mask)
        else {
            return 0;
        };
        let mut flags = 0;
        if mask.contains(KeyButMask::CONTROL) {
            flags |= 1;
        }
        if mask.contains(KeyButMask::MOD1) {
            flags |= 2;
        }
        if mask.contains(KeyButMask::SHIFT) {
            flags |= 4;
        }
        if mask.contains(KeyButMask::MOD4) {
            flags |= 8;
        }
        flags
    }
}

/// Takes a panel's reserved edge off a monitor's work area when the panel sits on that monitor.
fn apply_strut(screen: &mut Screen, s: &[f64; 12], (root_w, root_h): (f64, f64)) {
    let f = screen.frame;
    let mut w = screen.work_area;
    let (f_max_x, f_max_y) = (f.x + f.width, f.y + f.height);
    let overlaps = |a0: f64, a1: f64, b0: f64, b1: f64| a0 <= b1 && b0 <= a1;
    let [
        left,
        right,
        top,
        bottom,
        left_y0,
        left_y1,
        right_y0,
        right_y1,
        top_x0,
        top_x1,
        bottom_x0,
        bottom_x1,
    ] = *s;
    if left > 0.0 && f.x < left && overlaps(left_y0, left_y1, f.y, f_max_y) {
        let max_x = w.x + w.width;
        w.x = w.x.max(left);
        w.width = max_x - w.x;
    }
    if right > 0.0 && f_max_x > root_w - right && overlaps(right_y0, right_y1, f.y, f_max_y) {
        w.width = (w.x + w.width).min(root_w - right) - w.x;
    }
    if top > 0.0 && f.y < top && overlaps(top_x0, top_x1, f.x, f_max_x) {
        let max_y = w.y + w.height;
        w.y = w.y.max(top);
        w.height = max_y - w.y;
    }
    if bottom > 0.0 && f_max_y > root_h - bottom && overlaps(bottom_x0, bottom_x1, f.x, f_max_x) {
        w.height = (w.y + w.height).min(root_h - bottom) - w.y;
    }
    if w.width > 0.0 && w.height > 0.0 {
        screen.work_area = w;
    }
}

pub fn snapshot(with_windows: bool) -> Result<Snapshot, String> {
    let x = x11()?;
    let windows = if with_windows {
        let desktop = x.current_desktop();
        let mut stacking = x.cardinals(x.root, x.atoms._NET_CLIENT_LIST_STACKING);
        stacking.reverse(); // the property lists bottom to top
        stacking
            .into_iter()
            .filter(|w| x.is_ordinary(*w, desktop))
            .filter_map(|w| x.info(w))
            .collect()
    } else {
        Vec::new()
    };
    Ok(Snapshot {
        active: x.info(x.active()),
        screens: x.screens(),
        windows,
        refusing_app: None,
    })
}

pub fn apply(moves: &[Move]) -> Result<(), String> {
    let x = x11()?;
    let a = &x.atoms;
    for item in moves {
        let window = item.id as XWindow;
        // A maximized or full screen window ignores new sizes, so those states go first.
        x.send_to_root(
            window,
            a._NET_WM_STATE,
            [
                0,
                a._NET_WM_STATE_MAXIMIZED_VERT,
                a._NET_WM_STATE_MAXIMIZED_HORZ,
                2,
                0,
            ],
        )?;
        x.send_to_root(
            window,
            a._NET_WM_STATE,
            [0, a._NET_WM_STATE_FULLSCREEN, 0, 2, 0],
        )?;
        let frame = x.extents(window, a._NET_FRAME_EXTENTS);
        let shadow = x.extents(window, a._GTK_FRAME_EXTENTS);
        let r = item.rect;
        // North-west gravity: x and y are where the outer frame starts, width and height are the
        // client size. The GTK shadow sits outside what people see, so it is added back.
        let left = r.x - shadow[0];
        let top = r.y - shadow[2];
        let width = (r.width - frame[0] - frame[1] + shadow[0] + shadow[1]).max(1.0);
        let height = (r.height - frame[2] - frame[3] + shadow[2] + shadow[3]).max(1.0);
        let flags = 1 | (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (2 << 12);
        x.send_to_root(
            window,
            a._NET_MOVERESIZE_WINDOW,
            [
                flags,
                left.round() as i32 as u32,
                top.round() as i32 as u32,
                width.round() as u32,
                height.round() as u32,
            ],
        )?;
    }
    x.connection.flush().map_err(error)
}

/// X11 lets any app move other apps' windows; Wayland lets none, and asking changes nothing.
pub fn is_trusted(_prompt: bool) -> bool {
    x11().is_ok()
}

pub fn frontmost_app() -> Option<AppInfo> {
    let x = x11().ok()?;
    let active = x.active();
    (active != 0 && !x.is_own(active)).then(|| x.app_of(active))
}

fn send(event: Event) {
    if let Some(sink) = SINK.lock().unwrap().as_ref() {
        sink(event);
    }
}

/// X11 tells about the active window through property events but not about modifier keys
/// without grabbing the keyboard, so a thread looks every 50 ms and sends what changed.
pub fn watch(sink: Sink) {
    let first = SINK.lock().unwrap().replace(sink).is_none();
    if !first || x11().is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("split-watch".into())
        .spawn(|| {
            let Ok(x) = x11() else { return };
            let mut flags = 0u32;
            let mut front: XWindow = 0;
            let mut app = String::new();
            loop {
                let now = x.modifier_flags();
                if now != flags {
                    flags = now;
                    send(Event::Modifiers(flags));
                }
                let active = x.active();
                if active != front {
                    front = active;
                    if active != 0 && !x.is_own(active) {
                        let info = x.app_of(active);
                        if info.id != app {
                            app = info.id.clone();
                            send(Event::Activated(info));
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        })
        .expect("failed to start the watch thread");
}
