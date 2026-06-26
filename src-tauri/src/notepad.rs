//! Floating quick-note window driven entirely from the Rust process.
//! The main/settings webview does not create, show, hide, or register shortcuts for this window.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState};

pub const LABEL: &str = "floating-note";
const DEFAULT_WIDTH: f64 = 600.0;
const DEFAULT_HEIGHT: f64 = 500.0;
const DEFAULT_X: f64 = 100.0;
const DEFAULT_Y: f64 = 100.0;
const MIN_WIDTH: f64 = 360.0;
const MIN_HEIGHT: f64 = 280.0;
const WINDOW_GEOMETRY_FILE: &str = "floating-note-window.json";

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self {
            x: DEFAULT_X,
            y: DEFAULT_Y,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
        }
    }
}

impl WindowGeometry {
    fn usable(self) -> Option<Self> {
        if !self.x.is_finite()
            || !self.y.is_finite()
            || !self.width.is_finite()
            || !self.height.is_finite()
        {
            return None;
        }

        Some(Self {
            x: self.x,
            y: self.y,
            width: self.width.max(MIN_WIDTH),
            height: self.height.max(MIN_HEIGHT),
        })
    }
}

pub fn shortcut_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    GlobalShortcutBuilder::new()
        .with_shortcut("Ctrl+Shift+J")
        .expect("floating-note global shortcut should parse")
        .with_handler(|app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let h = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(e) = toggle_notepad(&h) {
                    eprintln!("floating-note toggle: {e}");
                }
            });
        })
        .build()
}

fn toggle_notepad<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(LABEL) {
        if crate::is_notepad_overlay_visible(&win) {
            close_notepad(app, &win)
        } else {
            show_notepad(app, &win)
        }
    } else {
        create_and_show_notepad(app)
    }
}

fn close_notepad<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let _ = save_window_geometry(app, win);
    crate::remember_focus_before_notepad_hide();
    crate::hide_notepad_overlay(win)?;
    if !crate::restore_focus_after_notepad_hide() {
        crate::deactivate_app_shell();
    }
    Ok(())
}

fn show_notepad<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    crate::remember_focus_before_notepad_show();
    crate::apply_notepad_overlay(app, win)?;
    win.show().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    win.set_focus().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    crate::reassert_notepad_macos_overlay(app, win)?;
    Ok(())
}

fn geometry_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    path.push(WINDOW_GEOMETRY_FILE);
    Ok(path)
}

fn load_window_geometry<R: Runtime>(app: &AppHandle<R>) -> WindowGeometry {
    let Ok(path) = geometry_path(app) else {
        return WindowGeometry::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return WindowGeometry::default();
    };
    let Ok(geometry) = serde_json::from_str::<WindowGeometry>(&contents) else {
        return WindowGeometry::default();
    };

    geometry.usable().unwrap_or_default()
}

fn save_window_geometry<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let scale_factor = win.scale_factor().map_err(|e| e.to_string())?;
    let position = win
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    let size = win
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);

    let geometry = WindowGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
    .usable()
    .unwrap_or_default();

    let path = geometry_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let contents = serde_json::to_string_pretty(&geometry).map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

fn register_window_geometry_persistence<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
) {
    let app = app.clone();
    let event_win = win.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::ScaleFactorChanged { .. } => {
            if let Err(e) = save_window_geometry(&app, &event_win) {
                eprintln!("floating-note save geometry: {e}");
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = save_window_geometry(&app, &event_win);
            crate::remember_focus_before_notepad_hide();
            if let Err(e) = crate::hide_notepad_overlay(&event_win) {
                eprintln!("floating-note hide on close: {e}");
            }
            if !crate::restore_focus_after_notepad_hide() {
                crate::deactivate_app_shell();
            }
        }
        _ => {}
    });
}

pub fn build_notepad_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, String> {
    let geometry = load_window_geometry(app);
    let builder =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(PathBuf::from("floating-note")))
            .title("Quick Note")
            .inner_size(geometry.width, geometry.height)
            .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
            .position(geometry.x, geometry.y)
            .visible(false)
            .focused(false);

    #[cfg(target_os = "macos")]
    // let builder = builder.decorations(false).transparent(true);
    let builder = builder.transparent(true);

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "macos"))]
    let builder = builder.visible_on_all_workspaces(true).always_on_top(true);

    let win = builder.build().map_err(|e| e.to_string())?;
    register_window_geometry_persistence(app, &win);
    Ok(win)
}

/// Build the floating webview once at startup; keep it hidden until the shortcut shows it.
pub(crate) fn prefetch_hidden<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }

    let win = build_notepad_window(app)?;
    if let Err(e) = crate::apply_notepad_overlay(app, &win) {
        let _ = win.close();
        return Err(e);
    }

    Ok(())
}

fn apply_overlay_then_show_focus<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    crate::remember_focus_before_notepad_show();
    crate::apply_notepad_overlay(app, win)?;
    win.show().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    win.set_focus().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    crate::reassert_notepad_macos_overlay(app, win)?;
    Ok(())
}

/// Create and show after the window was torn down — uses Accessory handshake on macOS so the OS
/// does not forcibly foreground this app above the user's current app mid-session.
pub(crate) fn create_and_show_notepad<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    crate::prepare_notepad_create_activation_policy(app)?;

    match build_notepad_window(app) {
        Ok(win) => {
            if let Err(e) = apply_overlay_then_show_focus(app, &win) {
                let _ = win.close();
                let _ = crate::restore_regular_activation_policy(app);
                return Err(e);
            }
            Ok(())
        }
        Err(err) => {
            let _ = crate::restore_regular_activation_policy(app);
            Err(err)
        }
    }
}
