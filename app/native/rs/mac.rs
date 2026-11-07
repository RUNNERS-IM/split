//! macOS: monitors from NSScreen, windows through the Accessibility API (needs the Accessibility
//! permission). Only public API, so the same code can go to the Mac App Store.

use std::cell::RefCell;
use std::ffi::c_void;
use std::ptr::{self, NonNull};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSEvent, NSEventMask, NSEventModifierFlags, NSRunningApplication, NSScreen, NSWorkspace, NSWorkspaceApplicationKey,
    NSWorkspaceDidActivateApplicationNotification,
};
use objc2_foundation::{NSArray, NSDictionary, NSNotification, NSNumber, NSObjectProtocol, NSOperationQueue, NSRect, NSString};

use crate::{AppInfo, Event, Move, Rect, Screen, Snapshot, Window};

type CFTypeRef = *const c_void;
type AXUIElementRef = *const c_void;
type AXError = i32;

const AX_SUCCESS: AXError = 0;
const AX_INVALID_ELEMENT: AXError = -25202;
const AX_API_DISABLED: AXError = -25211;
const AX_VALUE_POINT: u32 = 1;
const AX_VALUE_SIZE: u32 = 2;
const CG_ON_SCREEN_ONLY: u32 = 1 << 0;
const CG_EXCLUDE_DESKTOP: u32 = 1 << 4;
const CG_NULL_WINDOW: u32 = 0;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(element: AXUIElementRef, attribute: CFTypeRef, value: *mut CFTypeRef) -> AXError;
    fn AXUIElementCopyAttributeValues(
        element: AXUIElementRef,
        attribute: CFTypeRef,
        index: isize,
        max: isize,
        values: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementSetAttributeValue(element: AXUIElementRef, attribute: CFTypeRef, value: CFTypeRef) -> AXError;
    fn AXValueCreate(kind: u32, value: *const c_void) -> CFTypeRef;
    fn AXValueGetValue(value: CFTypeRef, kind: u32, out: *mut c_void) -> u8;
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFTypeRef) -> u8;
    static kAXTrustedCheckOptionPrompt: CFTypeRef;
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
    fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *mut CGRect) -> u8;
    fn CGDisplayCreateUUIDFromDisplayID(display: u32) -> CFTypeRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRetain(value: CFTypeRef) -> CFTypeRef;
    fn CFRelease(value: CFTypeRef);
    fn CFEqual(a: CFTypeRef, b: CFTypeRef) -> u8;
    fn CFArrayGetCount(array: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
    fn CFUUIDCreateString(allocator: CFTypeRef, uuid: CFTypeRef) -> CFTypeRef;
}

/// An Accessibility attribute name; CFString and NSString are the same object.
fn attr(name: &str) -> Retained<NSString> {
    NSString::from_str(name)
}

fn cf(string: &NSString) -> CFTypeRef {
    string as *const NSString as CFTypeRef
}

/// Takes ownership of a +1 CF object as an Objective-C object (every CF type is one).
unsafe fn owned(value: CFTypeRef) -> Option<Retained<AnyObject>> {
    unsafe { Retained::from_raw(value as *mut AnyObject) }
}

/// An attribute value, or the Accessibility error that kept it back.
fn copy_attribute(element: AXUIElementRef, name: &str) -> Result<Option<Retained<AnyObject>>, AXError> {
    let name = attr(name);
    let mut value: CFTypeRef = ptr::null();
    let error = unsafe { AXUIElementCopyAttributeValue(element, cf(&name), &mut value) };
    if error != AX_SUCCESS {
        if !value.is_null() {
            unsafe { CFRelease(value) };
        }
        return Err(error);
    }
    Ok(unsafe { owned(value) })
}

fn string_attribute(element: AXUIElementRef, name: &str) -> Option<String> {
    let value = copy_attribute(element, name).ok()??;
    value.downcast::<NSString>().ok().map(|s| s.to_string())
}

fn bool_attribute(element: AXUIElementRef, name: &str) -> bool {
    let Ok(Some(value)) = copy_attribute(element, name) else { return false };
    value.downcast::<NSNumber>().map(|n| n.boolValue()).unwrap_or(false)
}

fn rect_of(element: AXUIElementRef) -> Option<Rect> {
    let position = copy_attribute(element, "AXPosition").ok()??;
    let size = copy_attribute(element, "AXSize").ok()??;
    let mut p = CGPoint::default();
    let mut s = CGSize::default();
    let ok = unsafe {
        AXValueGetValue(Retained::as_ptr(&position) as CFTypeRef, AX_VALUE_POINT, &mut p as *mut _ as *mut c_void) != 0
            && AXValueGetValue(Retained::as_ptr(&size) as CFTypeRef, AX_VALUE_SIZE, &mut s as *mut _ as *mut c_void) != 0
    };
    ok.then_some(Rect { x: p.x, y: p.y, width: s.width, height: s.height })
}

fn set_rect(element: AXUIElementRef, r: &Rect) -> AXError {
    let p = CGPoint { x: r.x, y: r.y };
    let s = CGSize { width: r.width, height: r.height };
    let (position_name, size_name) = (attr("AXPosition"), attr("AXSize"));
    unsafe {
        let position = AXValueCreate(AX_VALUE_POINT, &p as *const _ as *const c_void);
        let size = AXValueCreate(AX_VALUE_SIZE, &s as *const _ as *const c_void);
        // Why: macOS cuts a new size down to what fits from where the window still is, so a window
        // moving right or down comes out too small. Size, move, then size again, as the macOS app did.
        AXUIElementSetAttributeValue(element, cf(&size_name), size);
        let position_error = AXUIElementSetAttributeValue(element, cf(&position_name), position);
        let size_error = AXUIElementSetAttributeValue(element, cf(&size_name), size);
        CFRelease(position);
        CFRelease(size);
        if position_error != AX_SUCCESS { position_error } else { size_error }
    }
}

// ---------------------------------------------------------------------------------------------
// Window ids

struct Known {
    id: u32,
    element: AXUIElementRef,
}

/// Past this many remembered windows, the ones that no longer exist are dropped.
const PRUNE_AT: usize = 64;

thread_local! {
    // Why: a window id must stay the same between the shortcut that moves it and a later undo, or
    // until its monitor comes back, but the Accessibility API has no public window number, so the
    // elements themselves are kept for as long as their window exists.
    static KNOWN: RefCell<Vec<Known>> = const { RefCell::new(Vec::new()) };
    static NEXT_ID: RefCell<u32> = const { RefCell::new(1) };
    static REFUSING_APP: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn gone(element: AXUIElementRef) -> bool {
    matches!(copy_attribute(element, "AXRole"), Err(AX_INVALID_ELEMENT))
}

fn id_for(element: AXUIElementRef) -> u32 {
    KNOWN.with_borrow_mut(|known| {
        if let Some(k) = known.iter().find(|k| unsafe { CFEqual(k.element, element) } != 0) {
            return k.id;
        }
        if known.len() >= PRUNE_AT {
            known.retain(|k| {
                let keep = !gone(k.element);
                if !keep {
                    unsafe { CFRelease(k.element) };
                }
                keep
            });
        }
        let id = NEXT_ID.with_borrow_mut(|next| {
            let id = *next;
            *next += 1;
            id
        });
        known.push(Known { id, element: unsafe { CFRetain(element) } });
        id
    })
}

fn element_for(id: u32) -> Option<AXUIElementRef> {
    KNOWN.with_borrow(|known| known.iter().find(|k| k.id == id).map(|k| k.element))
}

// ---------------------------------------------------------------------------------------------
// Screens

fn main_thread() -> Result<MainThreadMarker, String> {
    MainThreadMarker::new().ok_or_else(|| "the native module must be called on the main thread".to_string())
}

fn primary_height(mtm: MainThreadMarker) -> f64 {
    NSScreen::screens(mtm).firstObject().map(|s| s.frame().size.height).unwrap_or(0.0)
}

fn top_left(r: NSRect, primary_height: f64) -> Rect {
    Rect { x: r.origin.x, y: primary_height - (r.origin.y + r.size.height), width: r.size.width, height: r.size.height }
}

fn contains(r: &Rect, x: f64, y: f64) -> bool {
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
}

/// The display UUID, which the macOS app saved layouts under.
fn display_uuid(screen: &NSScreen) -> String {
    let description = screen.deviceDescription();
    let number = description
        .objectForKey(&NSString::from_str("NSScreenNumber"))
        .and_then(|n| n.downcast::<NSNumber>().ok())
        .map(|n| n.unsignedIntValue());
    let Some(number) = number else { return String::new() };
    unsafe {
        let uuid = CGDisplayCreateUUIDFromDisplayID(number);
        if uuid.is_null() {
            return number.to_string();
        }
        let text = CFUUIDCreateString(ptr::null(), uuid);
        CFRelease(uuid);
        owned(text).and_then(|t| t.downcast::<NSString>().ok()).map(|t| t.to_string()).unwrap_or_default()
    }
}

fn screens(mtm: MainThreadMarker) -> Vec<Screen> {
    let height = primary_height(mtm);
    NSScreen::screens(mtm)
        .iter()
        .enumerate()
        .map(|(i, s)| Screen {
            frame: top_left(s.frame(), height),
            work_area: top_left(s.visibleFrame(), height),
            scale: s.backingScaleFactor(),
            primary: i == 0,
            id: display_uuid(&s),
        })
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Windows

fn app_of(pid: i32) -> (String, String) {
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid);
    let name = app.as_ref().and_then(|a| a.localizedName()).map(|n| n.to_string()).unwrap_or_default();
    let bundle = app.as_ref().and_then(|a| a.bundleIdentifier()).map(|b| b.to_string()).unwrap_or_default();
    (name, bundle)
}

/// Ordinary windows of one app, front to back: not minimized and not in full screen. Each is retained.
fn standard_windows_of(pid: i32) -> Vec<AXUIElementRef> {
    let mut result = Vec::new();
    let windows_name = attr("AXWindows");
    unsafe {
        let application = AXUIElementCreateApplication(pid);
        let mut windows: CFTypeRef = ptr::null();
        if AXUIElementCopyAttributeValues(application, cf(&windows_name), 0, 100, &mut windows) == AX_SUCCESS && !windows.is_null() {
            for i in 0..CFArrayGetCount(windows) {
                let window = CFArrayGetValueAtIndex(windows, i);
                if string_attribute(window, "AXSubrole").as_deref() != Some("AXStandardWindow") {
                    continue;
                }
                if bool_attribute(window, "AXMinimized") || bool_attribute(window, "AXFullScreen") {
                    continue;
                }
                result.push(CFRetain(window));
            }
            CFRelease(windows);
        }
        CFRelease(application);
    }
    result
}

const MINIMUM_WINDOW_SIDE: f64 = 80.0;
const SAME_WINDOW_TOLERANCE: f64 = 2.0;

fn number(info: &NSDictionary<NSString, AnyObject>, key: &str) -> Option<Retained<NSNumber>> {
    info.objectForKey(&NSString::from_str(key)).and_then(|v| v.downcast::<NSNumber>().ok())
}

/// The window server lists windows in the order they were last used; the Accessibility window
/// that sits exactly at a listed frame is taken as that window, since only public API is used.
fn visible_windows(screens: &[Screen]) -> Vec<Window> {
    let own_pid = std::process::id() as i32;
    let Some(infos) = (unsafe { owned(CGWindowListCopyWindowInfo(CG_ON_SCREEN_ONLY | CG_EXCLUDE_DESKTOP, CG_NULL_WINDOW)) })
    else {
        return Vec::new();
    };
    let infos: Retained<NSArray<NSDictionary<NSString, AnyObject>>> = unsafe { Retained::cast_unchecked(infos) };
    let mut pools: Vec<(i32, Vec<AXUIElementRef>)> = Vec::new();
    let mut result = Vec::new();
    for info in infos.iter() {
        if number(&info, "kCGWindowLayer").map(|n| n.integerValue()) != Some(0) {
            continue;
        }
        if number(&info, "kCGWindowAlpha").map(|n| n.doubleValue()).unwrap_or(0.0) <= 0.0 {
            continue;
        }
        let Some(pid) = number(&info, "kCGWindowOwnerPID").map(|n| n.intValue()) else { continue };
        if pid == own_pid {
            continue;
        }
        let Some(bounds) = info.objectForKey(&NSString::from_str("kCGWindowBounds")) else { continue };
        let mut b = CGRect::default();
        if unsafe { CGRectMakeWithDictionaryRepresentation(Retained::as_ptr(&bounds) as CFTypeRef, &mut b) } == 0 {
            continue;
        }
        if b.size.width < MINIMUM_WINDOW_SIDE || b.size.height < MINIMUM_WINDOW_SIDE {
            continue;
        }
        let (mid_x, mid_y) = (b.origin.x + b.size.width / 2.0, b.origin.y + b.size.height / 2.0);
        if !screens.iter().any(|s| contains(&s.frame, mid_x, mid_y)) {
            continue;
        }
        let index = match pools.iter().position(|(p, _)| *p == pid) {
            Some(index) => index,
            None => {
                pools.push((pid, standard_windows_of(pid)));
                pools.len() - 1
            }
        };
        let pool = &mut pools[index].1;
        let same = pool.iter().position(|&element| {
            rect_of(element).is_some_and(|r| {
                (r.x - b.origin.x).abs() <= SAME_WINDOW_TOLERANCE
                    && (r.y - b.origin.y).abs() <= SAME_WINDOW_TOLERANCE
                    && (r.width - b.size.width).abs() <= SAME_WINDOW_TOLERANCE
                    && (r.height - b.size.height).abs() <= SAME_WINDOW_TOLERANCE
            })
        });
        if let Some(position) = same {
            let element = pool.remove(position);
            if let Some(rect) = rect_of(element) {
                let (app, bundle) = app_of(pid);
                let title = string_attribute(element, "AXTitle").unwrap_or_default();
                result.push(Window { id: id_for(element), rect, app, bundle, title });
            }
            unsafe { CFRelease(element) };
        }
    }
    for (_, pool) in pools {
        for element in pool {
            unsafe { CFRelease(element) };
        }
    }
    result
}

pub fn snapshot(with_windows: bool) -> Result<Snapshot, String> {
    let mtm = main_thread()?;
    let screens = screens(mtm);
    let mut active = None;
    if let Some(front) = NSWorkspace::sharedWorkspace().frontmostApplication() {
        let pid = front.processIdentifier();
        let (name, bundle) = app_of(pid);
        let application = unsafe { AXUIElementCreateApplication(pid) };
        let focused = copy_attribute(application, "AXFocusedWindow");
        unsafe { CFRelease(application) };
        REFUSING_APP.with_borrow_mut(|refusing| {
            // Why: an app started before the permission was given can keep refusing until it restarts.
            if matches!(focused, Err(AX_API_DISABLED)) && unsafe { AXIsProcessTrusted() } != 0 {
                *refusing = Some(name.clone());
            } else if matches!(focused, Ok(Some(_))) && refusing.as_deref() == Some(name.as_str()) {
                *refusing = None;
            }
        });
        if let Ok(Some(window)) = focused {
            let element = Retained::as_ptr(&window) as AXUIElementRef;
            if let Some(rect) = rect_of(element) {
                let title = string_attribute(element, "AXTitle").unwrap_or_default();
                active = Some(Window { id: id_for(element), rect, app: name, bundle, title });
            }
        }
    }
    let windows = if with_windows { visible_windows(&screens) } else { Vec::new() };
    Ok(Snapshot { active, screens, windows, refusing_app: REFUSING_APP.with_borrow(|r| r.clone()) })
}

pub fn apply(moves: &[Move]) -> Result<(), String> {
    let mtm = main_thread()?;
    let screens = screens(mtm);
    for m in moves {
        let element = element_for(m.id).ok_or("unknown window")?;
        let target = m.rect;
        let error = set_rect(element, &target);
        if error != AX_SUCCESS {
            return Err(format!("could not move window ({error})"));
        }
        // Why: terminals and similar apps only take sizes in whole character cells, so they end up
        // larger than asked. Shrink a little at a time and centre what is left, as Spectacle did.
        if let Some(mut moved) = rect_of(element)
            && (moved.width > target.width || moved.height > target.height)
        {
            let mut adjusted = target;
            while moved.width > target.width || moved.height > target.height {
                if moved.width > target.width {
                    adjusted.width -= 2.0;
                }
                if moved.height > target.height {
                    adjusted.height -= 2.0;
                }
                if adjusted.width < target.width * 0.85 || adjusted.height < target.height * 0.85 {
                    break;
                }
                set_rect(element, &adjusted);
                match rect_of(element) {
                    Some(r) => moved = r,
                    None => break,
                }
            }
            adjusted.x += ((target.width - moved.width) / 2.0).floor();
            adjusted.y += ((target.height - moved.height) / 2.0).floor();
            set_rect(element, &adjusted);
        }
        // Why: some apps keep a minimum size, so the window may stick out of the screen; pull it back in.
        let screen = screens
            .iter()
            .rev()
            .find(|s| contains(&s.frame, target.x + target.width / 2.0, target.y + target.height / 2.0));
        if let (Some(screen), Some(moved)) = (screen, rect_of(element)) {
            let visible = screen.work_area;
            let mut fixed = moved;
            if fixed.x < visible.x {
                fixed.x = visible.x;
            } else if fixed.x + fixed.width > visible.x + visible.width {
                fixed.x = visible.x + visible.width - fixed.width;
            }
            if fixed.y < visible.y {
                fixed.y = visible.y;
            } else if fixed.y + fixed.height > visible.y + visible.height {
                fixed.y = visible.y + visible.height - fixed.height;
            }
            if fixed.x != moved.x || fixed.y != moved.y {
                set_rect(element, &fixed);
            }
        }
    }
    Ok(())
}

pub fn is_trusted(prompt: bool) -> bool {
    let key: &AnyObject = unsafe { &*(kAXTrustedCheckOptionPrompt as *const AnyObject) };
    let key: &NSString = unsafe { &*(key as *const AnyObject as *const NSString) };
    let options = NSDictionary::from_slices(&[key], &[&*NSNumber::new_bool(prompt)]);
    unsafe { AXIsProcessTrustedWithOptions(Retained::as_ptr(&options) as CFTypeRef) != 0 }
}

fn info_of(app: &NSRunningApplication) -> AppInfo {
    AppInfo {
        id: app.bundleIdentifier().map(|b| b.to_string()).unwrap_or_default(),
        name: app.localizedName().map(|n| n.to_string()).unwrap_or_default(),
    }
}

pub fn frontmost_app() -> Option<AppInfo> {
    NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| info_of(&a))
}

fn flags_of(modifiers: NSEventModifierFlags) -> u32 {
    let mut flags = 0;
    if modifiers.contains(NSEventModifierFlags::Control) {
        flags |= 1;
    }
    if modifiers.contains(NSEventModifierFlags::Option) {
        flags |= 2;
    }
    if modifiers.contains(NSEventModifierFlags::Shift) {
        flags |= 4;
    }
    if modifiers.contains(NSEventModifierFlags::Command) {
        flags |= 8;
    }
    flags
}

type Sink = Box<dyn Fn(Event)>;

struct Watching {
    _global: Option<Retained<AnyObject>>,
    _local: Option<Retained<AnyObject>>,
    _activation: Retained<ProtocolObject<dyn NSObjectProtocol>>,
}

thread_local! {
    static SINK: RefCell<Option<Sink>> = const { RefCell::new(None) };
    static WATCHING: RefCell<Option<Watching>> = const { RefCell::new(None) };
}

fn send(event: Event) {
    SINK.with_borrow(|sink| {
        if let Some(sink) = sink {
            sink(event);
        }
    });
}

pub fn watch(sink: Sink) {
    SINK.set(Some(sink));
    if WATCHING.with_borrow(|w| w.is_some()) {
        return;
    }
    let global_block = RcBlock::new(|event: NonNull<NSEvent>| {
        send(Event::Modifiers(flags_of(unsafe { event.as_ref() }.modifierFlags())));
    });
    let local_block = RcBlock::new(|event: NonNull<NSEvent>| -> *mut NSEvent {
        send(Event::Modifiers(flags_of(unsafe { event.as_ref() }.modifierFlags())));
        event.as_ptr()
    });
    let activation_block = RcBlock::new(|note: NonNull<NSNotification>| {
        let info = unsafe { note.as_ref() }.userInfo();
        let app = info
            .and_then(|i| i.objectForKey(unsafe { NSWorkspaceApplicationKey }))
            .and_then(|a| a.downcast::<NSRunningApplication>().ok());
        if let Some(app) = app {
            send(Event::Activated(info_of(&app)));
        }
    });
    // Why: the global monitor only hears keys meant for other apps; the local one covers Split's own windows.
    let global = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::FlagsChanged, &global_block);
    let local = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::FlagsChanged, &local_block) };
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let queue = NSOperationQueue::mainQueue();
    let activation = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceDidActivateApplicationNotification),
            None,
            Some(&queue),
            &activation_block,
        )
    };
    WATCHING.set(Some(Watching { _global: global, _local: local, _activation: activation }));
}
