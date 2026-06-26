// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod notepad;

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

    use objc2::{runtime::AnyObject, ClassType, MainThreadMarker};
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSPanel, NSRunningApplication,
        NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
        NSWorkspace,
    };

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
        w.setStyleMask(
            w.styleMask()
                | NSWindowStyleMask::UtilityWindow
                | NSWindowStyleMask::NonactivatingPanel,
        );
        w.setLevel(NSScreenSaverWindowLevel);
        w.setCollectionBehavior(notepad_collection_behavior());
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

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
