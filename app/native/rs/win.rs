//! Windows, through Win32: monitors, top-level windows, moving them, the app in front and the
//! modifier keys held.
//!
//! All coordinates are physical pixels: Electron makes the process per-monitor DPI aware (v2),
//! so Win32 reports real pixels on every monitor, and each screen's `scale` turns the gap into pixels.

use std::ffi::c_void;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;

use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows_sys::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows_sys::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITOR_DEFAULTTONEAREST, MONITORINFO, MONITORINFOEXW, MonitorFromWindow,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_OWNER, GWL_EXSTYLE, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowRect,
    GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed,
    MONITORINFOF_PRIMARY, SW_RESTORE, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER, SetWindowPos, ShowWindow,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

use crate::{AppInfo, Event, Move, Rect, Screen, Snapshot, Window};

/// The last window of another app that had the focus. Choosing an action from the tray menu gives
/// the focus to the taskbar first, so that action goes to this window instead.
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
type Sink = Box<dyn Fn(Event) + Send + Sync>;

static SINK: Mutex<Option<Sink>> = Mutex::new(None);

// Why: HWNDs only use their low 32 bits (64-bit Windows keeps them shareable with 32-bit apps),
// so they fit the u32 id; sign extension gives the same handle back.
fn hwnd_of(id: u32) -> HWND {
    id as i32 as isize as HWND
}

fn id_of(hwnd: HWND) -> u32 {
    hwnd as isize as u32
}

fn rect_of(r: &RECT) -> Rect {
    Rect { x: r.left as f64, y: r.top as f64, width: (r.right - r.left) as f64, height: (r.bottom - r.top) as f64 }
}

fn outer_rect(hwnd: HWND) -> Option<Rect> {
    let mut r: RECT = unsafe { std::mem::zeroed() };
    (unsafe { GetWindowRect(hwnd, &mut r) } != 0).then(|| rect_of(&r))
}

/// The window as people see it. Since Windows 10, GetWindowRect includes an invisible resize
/// border of about 7 px on the left, right and bottom; DWM knows the visible part.
fn visible_rect(hwnd: HWND) -> Option<Rect> {
    let mut frame: RECT = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS as _, &mut frame as *mut RECT as *mut c_void, size_of::<RECT>() as u32)
    } == 0;
    if ok { Some(rect_of(&frame)) } else { outer_rect(hwnd) }
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    let ok = unsafe { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as _, &mut cloaked as *mut u32 as *mut c_void, size_of::<u32>() as u32) } == 0;
    ok && cloaked != 0
}

fn process_id(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    pid
}

/// The program file of the window's process, for example `C:\Program Files\...\chrome.exe`.
fn program_of(hwnd: HWND) -> Option<String> {
    let pid = process_id(hwnd);
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = [0u16; 1024];
    let mut length = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut length) } != 0;
    unsafe { CloseHandle(handle) };
    ok.then(|| String::from_utf16_lossy(&buffer[..length as usize]))
}

/// `chrome.exe` as the id (the same in every language) and `chrome` as the name.
fn app_of(hwnd: HWND) -> AppInfo {
    match program_of(hwnd) {
        Some(path) => {
            let path = Path::new(&path);
            let file = path.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
            let stem = path.file_stem().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| file.clone());
            AppInfo { id: file.to_lowercase(), name: stem }
        }
        None => {
            let pid = process_id(hwnd);
            AppInfo { id: format!("pid:{pid}"), name: format!("pid:{pid}") }
        }
    }
}

fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

fn title_of(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let length = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

/// The taskbar, the desktop and other shell parts are never moved.
fn is_shell_window(hwnd: HWND) -> bool {
    matches!(
        class_name(hwnd).as_str(),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW" | "Windows.UI.Core.CoreWindow"
    )
}

fn window_info(hwnd: HWND) -> Option<Window> {
    if hwnd.is_null() || is_shell_window(hwnd) || process_id(hwnd) == unsafe { GetCurrentProcessId() } {
        return None;
    }
    let app = app_of(hwnd);
    Some(Window { id: id_of(hwnd), rect: visible_rect(hwnd)?, app: app.name, bundle: app.id, title: title_of(hwnd) })
}

/// A window someone would call "a window": visible, not minimized, not a tool palette or popup
/// that belongs to another window, not hidden on another virtual desktop.
fn is_ordinary(hwnd: HWND) -> bool {
    unsafe {
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
            return false;
        }
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if ex_style & WS_EX_TOOLWINDOW != 0 || ex_style & WS_EX_NOACTIVATE != 0 {
            return false;
        }
        GetWindowTextLengthW(hwnd) > 0 && !is_cloaked(hwnd)
    }
}

unsafe extern "system" fn collect_window(hwnd: HWND, data: LPARAM) -> i32 {
    let list = unsafe { &mut *(data as *mut Vec<HWND>) };
    list.push(hwnd);
    1
}

/// Top-level windows front to back (EnumWindows walks the Z order from the top).
fn ordinary_windows() -> Vec<Window> {
    let mut handles: Vec<HWND> = Vec::new();
    unsafe { EnumWindows(Some(collect_window), &mut handles as *mut Vec<HWND> as LPARAM) };
    handles.into_iter().filter(|h| is_ordinary(*h)).filter_map(window_info).collect()
}

unsafe extern "system" fn collect_monitor(monitor: HMONITOR, _dc: HDC, _clip: *mut RECT, data: LPARAM) -> i32 {
    let list = unsafe { &mut *(data as *mut Vec<Screen>) };
    let mut info: MONITORINFOEXW = unsafe { std::mem::zeroed() };
    info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
    if unsafe { GetMonitorInfoW(monitor, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO) } != 0 {
        let mut dpi_x = 96u32;
        let mut dpi_y = 96u32;
        if unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) } != 0 {
            dpi_x = 96;
        }
        let device = &info.szDevice;
        let length = device.iter().position(|c| *c == 0).unwrap_or(device.len());
        list.push(Screen {
            frame: rect_of(&info.monitorInfo.rcMonitor),
            work_area: rect_of(&info.monitorInfo.rcWork),
            scale: dpi_x as f64 / 96.0,
            primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
            // Why: `\\.\DISPLAY2` stays with the same output while Windows runs, which is what
            // putting windows back after a monitor returns needs.
            id: String::from_utf16_lossy(&device[..length]),
        });
    }
    1
}

fn screens() -> Vec<Screen> {
    let mut list: Vec<Screen> = Vec::new();
    unsafe { EnumDisplayMonitors(std::ptr::null_mut(), std::ptr::null(), Some(collect_monitor), &mut list as *mut Vec<Screen> as LPARAM) };
    list
}

pub fn snapshot(with_windows: bool) -> Result<Snapshot, String> {
    let foreground = unsafe { GetForegroundWindow() };
    let active = window_info(foreground).or_else(|| {
        let remembered = LAST_FOREGROUND.load(Ordering::Relaxed) as HWND;
        let usable = !remembered.is_null() && unsafe { IsWindow(remembered) } != 0 && unsafe { IsIconic(remembered) } == 0;
        if usable { window_info(remembered) } else { None }
    });
    Ok(Snapshot {
        active,
        screens: screens(),
        windows: if with_windows { ordinary_windows() } else { Vec::new() },
        refusing_app: None,
    })
}

pub fn apply(moves: &[Move]) -> Result<(), String> {
    for item in moves {
        let hwnd = hwnd_of(item.id);
        unsafe {
            if IsZoomed(hwnd) != 0 || IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
        }
        let monitor_before = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let place = |hwnd: HWND| {
            // Turn the visible rect we want into the outer rect Win32 sets, invisible borders included.
            let (Some(visible), Some(outer)) = (visible_rect(hwnd), outer_rect(hwnd)) else {
                return false;
            };
            let left = visible.x - outer.x;
            let top = visible.y - outer.y;
            let right = (outer.x + outer.width) - (visible.x + visible.width);
            let bottom = (outer.y + outer.height) - (visible.y + visible.height);
            let r = item.rect;
            unsafe {
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    (r.x - left).round() as i32,
                    (r.y - top).round() as i32,
                    (r.width + left + right).round() as i32,
                    (r.height + top + bottom).round() as i32,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                ) != 0
            }
        };
        if !place(hwnd) {
            return Err(format!("could not move window {:#x}", item.id));
        }
        // Why: moving to a monitor with another DPI makes the app rescale itself after the first
        // move, so the size is set once more on the new monitor.
        if unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) } != monitor_before {
            place(hwnd);
        }
    }
    Ok(())
}

/// Windows lets any app move other apps' windows (except ones running as administrator).
pub fn is_trusted(_prompt: bool) -> bool {
    true
}

pub fn frontmost_app() -> Option<AppInfo> {
    let foreground = unsafe { GetForegroundWindow() };
    (!foreground.is_null() && process_id(foreground) != unsafe { GetCurrentProcessId() }).then(|| app_of(foreground))
}

fn is_down(key: u16) -> bool {
    (unsafe { GetAsyncKeyState(key as i32) } as u16 & 0x8000) != 0
}

fn modifier_flags() -> u32 {
    let mut flags = 0;
    if is_down(VK_CONTROL) {
        flags |= 1;
    }
    if is_down(VK_MENU) {
        flags |= 2;
    }
    if is_down(VK_SHIFT) {
        flags |= 4;
    }
    if is_down(VK_LWIN) || is_down(VK_RWIN) {
        flags |= 8;
    }
    flags
}

fn send(event: Event) {
    if let Some(sink) = SINK.lock().unwrap().as_ref() {
        sink(event);
    }
}

/// Windows has no notification for "modifier keys changed" or "another app came to the front"
/// short of a keyboard hook, so a thread looks every 50 ms and sends what changed.
pub fn watch(sink: Sink) {
    let first = SINK.lock().unwrap().replace(sink).is_none();
    if !first {
        return;
    }
    std::thread::Builder::new()
        .name("split-watch".into())
        .spawn(|| {
            let mut flags = 0u32;
            let mut front: HWND = std::ptr::null_mut();
            let mut app = String::new();
            loop {
                let now = modifier_flags();
                if now != flags {
                    flags = now;
                    send(Event::Modifiers(flags));
                }
                let foreground = unsafe { GetForegroundWindow() };
                if foreground != front {
                    front = foreground;
                    if !foreground.is_null() && process_id(foreground) != unsafe { GetCurrentProcessId() } {
                        if window_info(foreground).is_some() {
                            LAST_FOREGROUND.store(foreground as isize, Ordering::Relaxed);
                        }
                        let info = app_of(foreground);
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
