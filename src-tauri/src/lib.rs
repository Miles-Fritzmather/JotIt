// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod notepad;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod settings;

#[cfg(target_os = "macos")]
pub(crate) fn remember_focus_before_notepad_show() {
    macos::remember_frontmost_application();
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn remember_focus_before_notepad_show() {}

#[cfg(target_os = "macos")]
pub(crate) fn remember_focus_before_notepad_hide() {
    macos::remember_frontmost_application();
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn remember_focus_before_notepad_hide() {}

#[cfg(target_os = "macos")]
pub(crate) fn restore_focus_after_notepad_hide() -> bool {
    macos::restore_frontmost_application()
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn restore_focus_after_notepad_hide() -> bool {
    false
}

/// Apply always-on-top / workspace overlay behavior used by the floating notepad (`notepad`).
/// Invoked only from Rust; never exposed over IPC so the UI cannot change this surface.
pub(crate) fn apply_notepad_overlay<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|e| e.to_string())?;
        let _ = app;
    }

    #[cfg(target_os = "macos")]
    {
        // Do not call [`WebviewWindow::set_always_on_top`] here: Tao applies `NSFloatingWindowLevel`
        // asynchronously, which routinely wins the race after we set a higher overlay level and
        // strands the sheet under the front app. Level is handled only via `configure_fullscreen_overlay`.
        macos::configure_fullscreen_overlay(window).map_err(|e| e.to_string())?;
        app.set_activation_policy(tauri::ActivationPolicy::Accessory)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Attach the native glass backdrop behind the (transparent) webview.
///
/// On macOS 26 (Tahoe) and later this inserts an `NSGlassEffectView` — Apple's real "Liquid Glass"
/// material — directly behind the webview, mirroring the approach of
/// `hkandala/tauri-plugin-liquid-glass`. On older systems the class does not exist, so we fall back
/// to a pinned `NSVisualEffectView` blur.
///
/// The fallback blur is pinned to [`NSVisualEffectState::Active`] so macOS never drops it back to
/// the inactive/clear appearance when the panel is not the key window — that focus-follows behavior
/// is the reason a CSS `backdrop-filter` blur visibly disappears after a few idle seconds. This is
/// applied once at window creation; reclassing to `NSPanel` later does not disturb the subview.
#[cfg(target_os = "macos")]
pub(crate) fn apply_notepad_vibrancy<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

    // Prefer real Liquid Glass when the OS provides it; otherwise fall through to the blur.
    if macos::apply_liquid_glass(window).map_err(|e| e.to_string())? {
        return Ok(());
    }

    apply_vibrancy(
        window,
        NSVisualEffectMaterial::HudWindow,
        Some(NSVisualEffectState::Active),
        Some(1.0),
    )
    .map_err(|e| e.to_string())
}

/// Re-run after [`WebviewWindow::show`] — some Cocoa paths adjust level/order on display.
#[cfg(target_os = "macos")]
pub(crate) fn reassert_notepad_macos_overlay<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| error.to_string())?;
    macos::order_floating_notepad_front(window).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn is_notepad_overlay_visible<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::is_window_visible(window).unwrap_or(false);
    }

    #[cfg(not(target_os = "macos"))]
    {
        window.is_visible().unwrap_or(false)
    }
}

pub(crate) fn hide_notepad_overlay<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::hide_window(window).map_err(|error| error.to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        window.hide().map_err(|error| error.to_string())
    }
}

pub(crate) fn prepare_notepad_create_activation_policy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| error.to_string())?;

    #[cfg(not(target_os = "macos"))]
    let _ = app;

    Ok(())
}

pub(crate) fn restore_regular_activation_policy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)
        .map_err(|error| error.to_string())?;

    #[cfg(not(target_os = "macos"))]
    let _ = app;

    Ok(())
}

pub(crate) fn deactivate_app_shell() {
    #[cfg(target_os = "macos")]
    macos::deactivate_application();
}

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::atomic::{AtomicI32, Ordering};

    use objc2::{
        msg_send,
        runtime::{AnyClass, AnyObject},
        sel, ClassType, MainThreadMarker,
    };
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSColor, NSPanel, NSRunningApplication,
        NSScreenSaverWindowLevel, NSView, NSWindow, NSWindowAnimationBehavior, NSWindowButton,
        NSWindowCollectionBehavior, NSWindowStyleMask, NSWindowTitleVisibility, NSWorkspace,
    };

    /// Liquid Glass material variant for the notepad backdrop. **Change this one constant to
    /// restyle the glass.** `NSGlassEffectView` exposes a (private) `variant` property; these are
    /// the known values on macOS 26. `Clear` (1) is the most transparent / "liquid" looking;
    /// `Regular` (0) is the standard frosted material.
    ///
    /// ```text
    ///  0 Regular           8 ControlCenter      16 Sidebar
    ///  1 Clear             9 NotificationCenter  17 AbuttedSidebar
    ///  2 Dock             10 Monogram            18 Inspector
    ///  3 AppIcons         11 Bubbles             19 Control
    ///  4 Widgets          12 Identity            20 Loupe
    ///  5 Text             13 FocusBorder         21 Slider
    ///  6 AVPlayer         14 FocusPlatter        22 Camera
    ///  7 FaceTime         15 Keyboard            23 CartouchePopover
    /// ```
    const NOTEPAD_GLASS_VARIANT: isize = 1; // Clear — most transparent / liquid

    /// Notepad corner radius; matches the CSS `rounded-[16px]` on the editor shell so the native
    /// glass is clipped to the same rounded rectangle as the webview content.
    const NOTEPAD_CORNER_RADIUS: f64 = 16.0;
    /// `NSAutoresizingMaskOptions`: `WidthSizable | HeightSizable`, so the glass tracks resizes.
    const NS_VIEW_FLEXIBLE_SIZE: usize = (1 << 1) | (1 << 4);
    /// `NSWindowOrderingMode::Below` — keep the glass at the very back, under the webview.
    const NS_WINDOW_BELOW: isize = -1;

    /// Insert an `NSGlassEffectView` (macOS 26+ "Liquid Glass") behind the transparent webview.
    ///
    /// Returns `Ok(false)` when the class is unavailable (pre-Tahoe) so the caller can fall back to
    /// `NSVisualEffectView`. The view is sized to the content view, clipped to the notepad corner
    /// radius, and ordered below the webview so the editor renders on top of the glass.
    pub(super) fn apply_liquid_glass<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<bool> {
        let Some(glass_class) = AnyClass::get(c"NSGlassEffectView") else {
            return Ok(false);
        };

        let ptr = window.ns_window()? as *mut NSWindow;
        let ns_window = unsafe { &*ptr };
        let Some(content_view) = ns_window.contentView() else {
            return Ok(false);
        };
        let bounds = content_view.bounds();

        // A very light tint lives *inside* the glass (refracted by it) rather than as a flat CSS
        // film on top, so the material still reads as real Liquid Glass. Keep alpha low — Apple's
        // own glass uses little to no tint; this is just enough to bias it slightly dark for white
        // text legibility. Raise alpha for a moodier/darker glass, drop to 0.0 (or remove) for clear.
        let tint = NSColor::colorWithSRGBRed_green_blue_alpha(0.1, 0.0, 0.0, 0.00);

        unsafe {
            let glass: *mut AnyObject = msg_send![glass_class, alloc];
            let glass: *mut AnyObject = msg_send![glass, initWithFrame: bounds];
            let _: () = msg_send![glass, setAutoresizingMask: NS_VIEW_FLEXIBLE_SIZE];
            let _: () = msg_send![glass, setWantsLayer: true];
            let _: () = msg_send![glass, setCornerRadius: NOTEPAD_CORNER_RADIUS];
            let _: () = msg_send![glass, setTintColor: &*tint];
            set_glass_variant(glass, NOTEPAD_GLASS_VARIANT);

            let content_ptr: *const NSView = &*content_view;
            let _: () = msg_send![
                content_ptr,
                addSubview: glass,
                positioned: NS_WINDOW_BELOW,
                relativeTo: std::ptr::null_mut::<AnyObject>(),
            ];
        }

        Ok(true)
    }

    /// Set the (private) `variant` on an `NSGlassEffectView`. Prefers the public-looking
    /// `setVariant:` and falls back to the `_setVariant:` ivar setter on builds that only expose the
    /// private selector. Silently no-ops if neither responds, so a macOS point release that renames
    /// or drops the selector can't crash the notepad.
    unsafe fn set_glass_variant(glass: *mut AnyObject, variant: isize) {
        let responds_public: bool = msg_send![glass, respondsToSelector: sel!(setVariant:)];
        if responds_public {
            let _: () = msg_send![glass, setVariant: variant];
            return;
        }

        let responds_private: bool = msg_send![glass, respondsToSelector: sel!(_setVariant:)];
        if responds_private {
            let _: () = msg_send![glass, _setVariant: variant];
        }
    }

    static LAST_FRONTMOST_APP_PID: AtomicI32 = AtomicI32::new(0);

    /// Collection behavior for a HUD that should be able to appear while *other* apps are
    /// fullscreen. Keep this in one AppKit call; Tauri/Tao's workspace setter only toggles
    /// `CanJoinAllSpaces` and can erase the fullscreen auxiliary hints.
    fn notepad_collection_behavior() -> NSWindowCollectionBehavior {
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::FullScreenAllowsTiling
            | NSWindowCollectionBehavior::CanJoinAllApplications
    }

    pub(super) fn configure_fullscreen_overlay<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<()> {
        let ptr = window.ns_window()? as *mut NSWindow;
        let obj = unsafe { &*(ptr as *mut AnyObject) };
        unsafe {
            AnyObject::set_class(obj, NSPanel::class());
        }

        let w = unsafe { &*ptr };
        // Keep the window `Titled` (do NOT use `.decorations(false)` on the builder): the window
        // server only honors `FullScreenAuxiliary` for titled panels, so a borderless window stops
        // floating over other apps' fullscreen spaces. We get the chromeless look by extending the
        // content view under a transparent, button-less titlebar instead of removing it.
        w.setStyleMask(
            w.styleMask()
                | NSWindowStyleMask::Titled
                | NSWindowStyleMask::FullSizeContentView
                | NSWindowStyleMask::UtilityWindow
                | NSWindowStyleMask::NonactivatingPanel,
        );
        w.setTitlebarAppearsTransparent(true);
        w.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        w.setMovableByWindowBackground(true);
        for button in [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ] {
            if let Some(button) = w.standardWindowButton(button) {
                button.setHidden(true);
            }
        }
        w.setLevel(NSScreenSaverWindowLevel);
        w.setCollectionBehavior(notepad_collection_behavior());
        w.setAnimationBehavior(NSWindowAnimationBehavior::None);
        w.setExcludedFromWindowsMenu(true);
        w.setHidesOnDeactivate(false);

        let panel = unsafe { &*(ptr as *mut NSPanel) };
        panel.setFloatingPanel(true);
        panel.setBecomesKeyOnlyIfNeeded(false);
        panel.setWorksWhenModal(true);
        Ok(())
    }

    pub(super) fn order_floating_notepad_front<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<()> {
        configure_fullscreen_overlay(window)?;

        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            #[allow(deprecated)]
            app.activateIgnoringOtherApps(true);
        }

        let ptr = window.ns_window()? as *mut NSWindow;
        let w = unsafe { &*ptr };
        w.makeKeyAndOrderFront(None::<&AnyObject>);
        w.orderFrontRegardless();
        Ok(())
    }

    pub(super) fn is_window_visible<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<bool> {
        let ptr = window.ns_window()? as *mut NSWindow;
        let w = unsafe { &*ptr };
        Ok(w.isVisible())
    }

    pub(super) fn hide_window<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<()> {
        let ptr = window.ns_window()? as *mut NSWindow;
        let w = unsafe { &*ptr };
        w.setAnimationBehavior(NSWindowAnimationBehavior::None);
        w.orderOut(None::<&AnyObject>);
        Ok(())
    }

    fn current_frontmost_application_pid() -> Option<i32> {
        let Some(frontmost) = NSWorkspace::sharedWorkspace().frontmostApplication() else {
            return None;
        };

        let pid = frontmost.processIdentifier();
        if pid > 0 && pid != std::process::id() as i32 && !frontmost.isTerminated() {
            Some(pid)
        } else {
            None
        }
    }

    fn activate_application_with_pid(pid: i32) -> bool {
        let Some(target) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
        else {
            return false;
        };
        if target.isTerminated() {
            return false;
        }

        #[allow(deprecated)]
        let options = NSApplicationActivationOptions::ActivateAllWindows
            | NSApplicationActivationOptions::ActivateIgnoringOtherApps;
        target.activateWithOptions(options)
    }

    pub(super) fn remember_frontmost_application() {
        if let Some(pid) = current_frontmost_application_pid() {
            LAST_FRONTMOST_APP_PID.store(pid, Ordering::Release);
        }
    }

    pub(super) fn restore_frontmost_application() -> bool {
        let saved_pid = LAST_FRONTMOST_APP_PID.swap(0, Ordering::AcqRel);
        let pid = current_frontmost_application_pid().or_else(|| {
            if saved_pid > 0 {
                Some(saved_pid)
            } else {
                None
            }
        });

        let Some(pid) = pid else {
            return false;
        };

        activate_application_with_pid(pid)
    }

    pub(super) fn deactivate_application() {
        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            app.deactivate();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(notepad::shortcut_plugin()).setup(|app| {
        #[cfg(target_os = "macos")]
        app.handle()
            .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

        notepad::prefetch_hidden(app.handle()).map_err(|e| e.to_string())?;
        Ok(())
    });
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        notepad::list_notes,
        notepad::read_note,
        notepad::create_note,
        notepad::save_note,
        notepad::update_note,
        notepad::delete_note,
        settings::get_settings,
        settings::set_accent_color,
        settings::reveal_notes_directory,
        settings::open_settings
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
