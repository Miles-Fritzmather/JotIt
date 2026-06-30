//! Persistent application settings (accent color) plus the on-demand settings window.
//! The notepad window never opens or owns this window; it only asks Rust to show it.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const SETTINGS_FILE: &str = "app-settings.json";
const DEFAULT_ACCENT: &str = "#ff6363";
const SETTINGS_LABEL: &str = "main";

/// Emitted to every webview when the accent changes so each window restyles live.
pub const ACCENT_CHANGED_EVENT: &str = "settings://accent-changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackdropMode {
    Glass,
    Blur,
}

impl Default for BackdropMode {
    fn default() -> Self {
        Self::Glass
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    accent_color: String,
    #[serde(default)]
    backdrop_mode: BackdropMode,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            accent_color: DEFAULT_ACCENT.to_string(),
            backdrop_mode: BackdropMode::default(),
        }
    }
}

/// What the settings UI needs: the persisted accent plus the (read-only) notes folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    accent_color: String,
    backdrop_mode: BackdropMode,
    notes_directory: String,
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    path.push(SETTINGS_FILE);
    Ok(path)
}

fn load_settings<R: Runtime>(app: &AppHandle<R>) -> StoredSettings {
    let Ok(path) = settings_path(app) else {
        return StoredSettings::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return StoredSettings::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn save_settings<R: Runtime>(app: &AppHandle<R>, settings: &StoredSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let contents = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

pub(crate) fn backdrop_mode<R: Runtime>(app: &AppHandle<R>) -> BackdropMode {
    load_settings(app).backdrop_mode
}

/// Accept `#rgb` / `#rrggbb` only — the value is interpolated straight into CSS in the frontend.
fn is_valid_hex_color(value: &str) -> bool {
    let Some(hex) = value.strip_prefix('#') else {
        return false;
    };
    matches!(hex.len(), 3 | 6) && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[tauri::command]
pub fn get_settings<R: Runtime>(app: AppHandle<R>) -> Result<SettingsView, String> {
    let stored = load_settings(&app);
    let notes_directory = crate::notepad::notes_path(&app)?
        .to_string_lossy()
        .into_owned();
    Ok(SettingsView {
        accent_color: stored.accent_color,
        backdrop_mode: stored.backdrop_mode,
        notes_directory,
    })
}

#[tauri::command]
pub fn set_accent_color<R: Runtime>(app: AppHandle<R>, color: String) -> Result<(), String> {
    if !is_valid_hex_color(&color) {
        return Err(format!("Invalid hex color: {color}"));
    }

    let mut stored = load_settings(&app);
    stored.accent_color = color.clone();
    save_settings(&app, &stored)?;
    app.emit(ACCENT_CHANGED_EVENT, color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_backdrop_mode<R: Runtime>(
    app: AppHandle<R>,
    backdrop_mode: BackdropMode,
) -> Result<(), String> {
    let mut stored = load_settings(&app);
    stored.backdrop_mode = backdrop_mode;
    save_settings(&app, &stored)?;

    if let Err(error) = crate::refresh_notepad_backdrop(&app) {
        eprintln!("floating-note backdrop refresh: {error}");
    }

    Ok(())
}

#[tauri::command]
pub fn reveal_notes_directory<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let dir = crate::notepad::ensure_notes_path(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // The settings window is a normal, focusable window, so the app must leave the notepad's
    // Accessory (no-dock) policy while it is open.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)
        .map_err(|e| e.to_string())?;

    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        &app,
        SETTINGS_LABEL,
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("Settings")
    .inner_size(480.0, 400.0)
    .min_inner_size(420.0, 340.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    // Keep the window cached across opens, and drop back to Accessory once it is dismissed so the
    // app stops showing a dock icon when only the notepad remains.
    let app_for_event = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(win) = app_for_event.get_webview_window(SETTINGS_LABEL) {
                let _ = win.hide();
            }
            #[cfg(target_os = "macos")]
            let _ = app_for_event.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    });

    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
