// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn configure_overlay_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;

    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|error| error.to_string())?;
        macos::configure_fullscreen_overlay(&window).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::{msg_send, runtime::AnyObject};

    const OVERLAY_WINDOW_LEVEL: isize = 10_000;
    const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    const STATIONARY: usize = 1 << 4;
    const FULL_SCREEN_AUXILIARY: usize = 1 << 8;

    pub(super) fn configure_fullscreen_overlay(window: &tauri::WebviewWindow) -> tauri::Result<()> {
        let ns_window = window.ns_window()?;

        // SAFETY: Tauri returns a valid NSWindow pointer for macOS windows.
        // These AppKit messages only mutate window presentation attributes on the main app thread.
        unsafe {
            let ns_window = ns_window.cast::<AnyObject>();
            let _: () = msg_send![ns_window, setLevel: OVERLAY_WINDOW_LEVEL];

            let behavior = CAN_JOIN_ALL_SPACES | STATIONARY | FULL_SCREEN_AUXILIARY;
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        }

        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, configure_overlay_window])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("notetaker")
            .inner_size(800.0, 600.0)
            .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
