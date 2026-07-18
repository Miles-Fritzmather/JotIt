// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod notepad;

use tauri::Manager;
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

/// Attach the native backdrop behind the (transparent) webview.
///
/// Mode comes from [`settings::backdrop_mode`]: Liquid Glass (`NSGlassEffectView` on macOS 26+,
/// with blur fallback on older systems) or a pinned `NSVisualEffectView` blur at
/// [`NSVisualEffectState::Active`] so the panel keeps the same appearance when it is not the key
/// window.
///
/// Applied at window creation and when the user changes the setting; reclassing to `NSPanel` later
/// does not disturb the subview.
#[cfg(target_os = "macos")]
pub(crate) fn apply_notepad_vibrancy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let mode = settings::backdrop_mode(app);
    macos::apply_backdrop(window, mode).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_notepad_vibrancy<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn refresh_notepad_backdrop<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let Some(win) = app.get_webview_window(notepad::LABEL) else {
        return Ok(());
    };
    apply_notepad_vibrancy(app, &win)
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

pub(crate) fn is_notepad_key_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::is_window_key(window).unwrap_or(false);
    }

    #[cfg(not(target_os = "macos"))]
    {
        window.is_focused().unwrap_or(false)
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

    use crate::settings::BackdropMode;
    use objc2::runtime::NSObjectProtocol;

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

    pub(super) fn apply_backdrop<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
        mode: BackdropMode,
    ) -> tauri::Result<()> {
        clear_backdrop_views(window)?;
        match mode {
            BackdropMode::Glass => {
                if apply_liquid_glass(window)? {
                    Ok(())
                } else {
                    apply_blur_backdrop(window)
                }
            }
            BackdropMode::Blur => apply_blur_backdrop(window),
        }
    }

    pub(super) fn clear_backdrop_views<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<()> {
        let ptr = window.ns_window()? as *mut NSWindow;
        let ns_window = unsafe { &*ptr };
        let Some(content_view) = ns_window.contentView() else {
            return Ok(());
        };

        let glass_class = AnyClass::get(c"NSGlassEffectView");
        let vibrancy_class = AnyClass::get(c"NSVisualEffectView");
        let subviews = content_view.subviews();
        let mut to_remove = Vec::new();

        for subview in subviews.iter() {
            let is_backdrop = [glass_class, vibrancy_class].into_iter().flatten().any(|class| {
                subview.isKindOfClass(class)
            });
            if is_backdrop {
                to_remove.push(subview.clone());
            }
        }

        for subview in to_remove {
            subview.removeFromSuperview();
        }

        Ok(())
    }

    pub(super) fn apply_blur_backdrop<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<()> {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

        apply_vibrancy(
            window,
            NSVisualEffectMaterial::HudWindow,
            Some(NSVisualEffectState::Active),
            Some(1.0),
        )
        .map_err(|e| tauri::Error::from(std::io::Error::other(e.to_string())))
    }

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

    /// Temporary behavior used while ordering a previously hidden panel. WindowServer can leave
    /// a `CanJoinAllSpaces` panel attached only to its original desktop after it has been hidden
    /// for a while. Moving the panel (even by a pixel) repairs that stale Space registration.
    /// Ordering it once with `MoveToActiveSpace` has the same effect without changing its frame;
    /// immediately afterwards we restore `CanJoinAllSpaces` so it keeps following Space changes.
    fn notepad_active_space_behavior() -> NSWindowCollectionBehavior {
        (notepad_collection_behavior() & !NSWindowCollectionBehavior::CanJoinAllSpaces)
            | NSWindowCollectionBehavior::MoveToActiveSpace
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

        let ptr = window.ns_window()? as *mut NSWindow;
        let w = unsafe { &*ptr };
        // `MoveToActiveSpace` and `CanJoinAllSpaces` are mutually exclusive. Apply the former only
        // for the ordering operation so a stale hidden panel is first adopted by the user's
        // current Space, then restore the permanent all-Spaces behavior below.
        w.setCollectionBehavior(notepad_active_space_behavior());

        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            #[allow(deprecated)]
            app.activateIgnoringOtherApps(true);
        }

        w.makeKeyAndOrderFront(None::<&AnyObject>);
        w.setCollectionBehavior(notepad_collection_behavior());
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

    pub(super) fn is_window_key<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> tauri::Result<bool> {
        let ptr = window.ns_window()? as *mut NSWindow;
        let w = unsafe { &*ptr };
        Ok(w.isKeyWindow())
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

    pub(super) fn share_file_at_anchor<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
        file_path: &std::path::Path,
        anchor_x: f64,
        anchor_y: f64,
    ) -> Result<(), String> {
        use objc2::rc::Retained;
        use objc2::runtime::AnyObject;
        use objc2::AnyThread;
        use objc2_app_kit::{NSSharingServicePicker, NSWindow};
        use objc2_foundation::{
            NSArray, NSPoint, NSRect, NSRectEdge, NSSize, NSString, NSURL,
        };

        let ptr = window.ns_window().map_err(|error| error.to_string())? as *mut NSWindow;
        let ns_window = unsafe { &*ptr };
        let Some(content_view) = ns_window.contentView() else {
            return Err("Floating note content view not found".to_string());
        };

        let view_height = content_view.bounds().size.height;
        let cocoa_y = view_height - anchor_y;
        let rect = NSRect::new(
            NSPoint::new(anchor_x, cocoa_y),
            NSSize::new(1.0, 1.0),
        );

        let path = NSString::from_str(&file_path.to_string_lossy());
        let url: Retained<NSURL> = NSURL::fileURLWithPath(&path);
        let url_object: &AnyObject = &*url;
        let items = NSArray::from_slice(&[url_object]);
        let picker = unsafe {
            NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), &items)
        };

        picker.showRelativeToRect_ofView_preferredEdge(
            rect,
            &content_view,
            NSRectEdge::MinY,
        );
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn share_note_file_at_anchor<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    file_path: &std::path::Path,
    anchor_x: f64,
    anchor_y: f64,
) -> Result<(), String> {
    macos::share_file_at_anchor(window, file_path, anchor_x, anchor_y)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn share_note_file_at_anchor<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
    _file_path: &std::path::Path,
    _anchor_x: f64,
    _anchor_y: f64,
) -> Result<(), String> {
    Err("Share sheet is only available on macOS".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(notepad::shortcut_plugin()).setup(|app| {
        #[cfg(target_os = "macos")]
        app.handle()
            .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

        notepad::prefetch_hidden(app.handle()).map_err(|e| e.to_string())?;
        notepad::apply_global_shortcut(app.handle()).map_err(|e| e.to_string())?;
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
        notepad::share_note,
        notepad::import_markdown_files,
        notepad::close_notepad_command,
        settings::get_settings,
        settings::set_accent_color,
        settings::set_backdrop_mode,
        settings::set_paste_with_formatting,
        settings::set_hide_on_screen_share,
        settings::set_strike_completed_tasks,
        settings::set_shortcut,
        settings::reveal_notes_directory,
        settings::open_settings
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
