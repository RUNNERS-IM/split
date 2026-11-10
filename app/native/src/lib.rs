//! Split's native module, loaded by the Electron main process (src/main/index.ts).
//! What each operating system gives Split: where the monitors and windows are, moving windows, the app
//! in front and the modifier keys held. The math, history and arrange live in TypeScript (src/core).
//! Everything here runs on the main thread, where Electron calls it.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod mac;
#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
mod other;
#[cfg(windows)]
mod win;
#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use mac as platform;
#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
use other as platform;
#[cfg(windows)]
use win as platform;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Copy, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// One monitor, top-left based in the coordinates windows are moved in.
#[napi(object)]
pub struct Screen {
    pub frame: Rect,
    pub work_area: Rect,
    pub scale: f64,
    pub primary: bool,
    /// Stays the same when the same monitor is plugged in again: the display UUID on macOS.
    pub id: String,
}

#[napi(object)]
pub struct Window {
    /// Finds the window again on a later call, for as long as the window exists.
    pub id: u32,
    pub rect: Rect,
    /// The name people see.
    pub app: String,
    /// Bundle id (macOS) or executable name; the same in every language, unlike `app`.
    pub bundle: String,
    pub title: String,
}

#[napi(object)]
pub struct Snapshot {
    pub active: Option<Window>,
    pub screens: Vec<Screen>,
    /// Ordinary visible windows, front to back. Only filled when asked for.
    pub windows: Vec<Window>,
    /// The app that refused to hand over its window although Split has permission, if any.
    pub refusing_app: Option<String>,
}

#[napi(object)]
pub struct Move {
    pub id: u32,
    pub rect: Rect,
}

/// The app in front: bundle id (macOS), executable name (Windows/Linux) and the name people see.
#[napi(object)]
#[derive(Clone)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
}

/// `{type: "modifiers", flags}` or `{type: "activated", app}`.
#[napi(object)]
pub struct WatchEvent {
    #[napi(js_name = "type")]
    pub kind: String,
    /// ctrl = 1, alt = 2, shift = 4, logo (⌘ / Super) = 8.
    pub flags: Option<u32>,
    pub app: Option<AppInfo>,
}

pub enum Event {
    Modifiers(u32),
    Activated(AppInfo),
}

#[napi]
pub fn snapshot(with_windows: Option<bool>) -> Result<Snapshot> {
    platform::snapshot(with_windows.unwrap_or(false)).map_err(Error::from_reason)
}

#[napi]
pub fn apply(moves: Vec<Move>) -> Result<()> {
    platform::apply(&moves).map_err(Error::from_reason)
}

/// Whether Split may move other apps' windows; `prompt` asks the user where the OS can.
#[napi]
pub fn is_trusted(prompt: Option<bool>) -> bool {
    platform::is_trusted(prompt.unwrap_or(false))
}

#[napi]
pub fn frontmost_app() -> Option<AppInfo> {
    platform::frontmost_app()
}

type Sink = ThreadsafeFunction<WatchEvent, (), WatchEvent, Status, false, true>;

/// Starts sending modifier and app-switch events to `callback`. Calling it again replaces the callback.
#[napi(ts_args_type = "callback: (event: WatchEvent) => void")]
pub fn watch(callback: Function<WatchEvent, ()>) -> Result<()> {
    // Why: weak, so an open watcher never keeps Node from exiting.
    let sink: Sink = callback.build_threadsafe_function::<WatchEvent>().weak::<true>().callee_handled::<false>().build()?;
    platform::watch(Box::new(move |event| {
        let value = match event {
            Event::Modifiers(flags) => WatchEvent { kind: "modifiers".into(), flags: Some(flags), app: None },
            Event::Activated(app) => WatchEvent { kind: "activated".into(), flags: None, app: Some(app) },
        };
        sink.call(value, ThreadsafeFunctionCallMode::NonBlocking);
    }));
    Ok(())
}

