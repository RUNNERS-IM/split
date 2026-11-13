//! Systems other than macOS, Windows and Linux: no screens, no windows, nothing moves.
use crate::{AppInfo, Event, Move, Snapshot};

pub fn snapshot(_with_windows: bool) -> Result<Snapshot, String> {
    Err("not supported on this system yet".into())
}

pub fn apply(_moves: &[Move]) -> Result<(), String> {
    Err("not supported on this system yet".into())
}

pub fn is_trusted(_prompt: bool) -> bool {
    true
}

pub fn frontmost_app() -> Option<AppInfo> {
    None
}

pub fn watch(_sink: Box<dyn Fn(Event) + Send + Sync>) {}
