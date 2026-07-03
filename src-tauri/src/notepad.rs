//! Floating quick-note window driven entirely from the Rust process.
//! The main/settings webview does not create, show, hide, or register shortcuts for this window.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

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
const NOTES_DIR: &str = "notes";
const NOTE_EXTENSION: &str = "md";
const METADATA_FILE: &str = "metadata.json";
const DEFAULT_NOTE_MARKDOWN: &str = "# Untitled\n\n";

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteMetadata {
    updated_at: u64,
    is_starred: bool,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct NotesMetadataStore {
    notes: HashMap<String, NoteMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    id: String,
    title: String,
    file_name: String,
    updated_at: u64,
    is_starred: bool,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    id: String,
    title: String,
    file_name: String,
    updated_at: u64,
    is_starred: bool,
    tags: Vec<String>,
    markdown: String,
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

fn system_time_secs(value: SystemTime) -> u64 {
    value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

pub(crate) fn notes_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push(NOTES_DIR);
    Ok(path)
}

pub(crate) fn ensure_notes_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let path = notes_path(app)?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn is_valid_note_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn note_path_for_id(notes_dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !is_valid_note_id(id) {
        return Err("Invalid note id".to_string());
    }

    Ok(notes_dir.join(format!("{id}.{NOTE_EXTENSION}")))
}

fn note_id_from_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    if extension != NOTE_EXTENSION {
        return None;
    }

    let id = path.file_stem()?.to_str()?.to_string();
    if is_valid_note_id(&id) {
        Some(id)
    } else {
        None
    }
}

fn normalized_title(value: &str) -> Option<String> {
    let title = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return None;
    }

    const MAX_CHARS: usize = 80;
    let mut chars = title.chars();
    let mut truncated = chars.by_ref().take(MAX_CHARS).collect::<String>();
    if chars.next().is_some() {
        truncated.push_str("...");
    }

    Some(truncated)
}

fn title_from_markdown(markdown: &str) -> String {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            if let Some(title) = normalized_title(heading.trim().trim_end_matches('#').trim()) {
                return title;
            }
        }
    }

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let fallback = trimmed
            .trim_start_matches(|ch| matches!(ch, '#' | '>' | '-' | '*' | '_' | '`'))
            .trim();
        if let Some(title) = normalized_title(fallback) {
            return title;
        }
    }

    "Untitled".to_string()
}

fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToString::to_string)
        .ok_or_else(|| "Invalid note file name".to_string())
}

fn now_secs() -> u64 {
    system_time_secs(SystemTime::now())
}

fn metadata_path(notes_dir: &Path) -> PathBuf {
    notes_dir.join(METADATA_FILE)
}

fn default_metadata() -> NoteMetadata {
    NoteMetadata {
        updated_at: now_secs(),
        is_starred: false,
        tags: Vec::new(),
    }
}

fn wipe_legacy_notes(notes_dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(notes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if note_id_from_path(&path).is_some() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn load_metadata_store(notes_dir: &Path) -> Result<NotesMetadataStore, String> {
    let path = metadata_path(notes_dir);
    if !path.exists() {
        wipe_legacy_notes(notes_dir)?;
        return Ok(NotesMetadataStore {
            notes: HashMap::new(),
        });
    }

    let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn save_metadata_store(notes_dir: &Path, store: &NotesMetadataStore) -> Result<(), String> {
    let path = metadata_path(notes_dir);
    let contents = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

fn reconcile_metadata_store(
    store: &mut NotesMetadataStore,
    notes_dir: &Path,
) -> Result<(), String> {
    let mut ids_on_disk = Vec::new();

    for entry in fs::read_dir(notes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Some(id) = note_id_from_path(&path) {
            ids_on_disk.push(id);
        }
    }

    store.notes.retain(|id, _| ids_on_disk.iter().any(|on_disk| on_disk == id));
    for id in ids_on_disk {
        store
            .notes
            .entry(id)
            .or_insert_with(default_metadata);
    }

    Ok(())
}

fn metadata_for_id(store: &NotesMetadataStore, id: &str) -> NoteMetadata {
    store
        .notes
        .get(id)
        .cloned()
        .unwrap_or_else(default_metadata)
}

fn note_summary_from_parts(
    path: &Path,
    id: String,
    markdown: &str,
    meta: &NoteMetadata,
) -> Result<NoteSummary, String> {
    Ok(NoteSummary {
        id,
        title: title_from_markdown(markdown),
        file_name: file_name(path)?,
        updated_at: meta.updated_at,
        is_starred: meta.is_starred,
        tags: meta.tags.clone(),
    })
}

fn note_document_from_parts(
    path: &Path,
    id: String,
    markdown: String,
    meta: &NoteMetadata,
) -> Result<NoteDocument, String> {
    Ok(NoteDocument {
        id,
        title: title_from_markdown(&markdown),
        file_name: file_name(path)?,
        updated_at: meta.updated_at,
        is_starred: meta.is_starred,
        tags: meta.tags.clone(),
        markdown,
    })
}

fn fresh_note_id(notes_dir: &Path) -> Result<String, String> {
    let base = now_millis();
    for attempt in 0..1000 {
        let id = if attempt == 0 {
            format!("note-{base}")
        } else {
            format!("note-{base}-{attempt}")
        };
        let path = note_path_for_id(notes_dir, &id)?;
        if !path.exists() {
            return Ok(id);
        }
    }

    Err("Unable to create a unique note file name".to_string())
}

#[tauri::command]
pub fn list_notes<R: Runtime>(app: AppHandle<R>) -> Result<Vec<NoteSummary>, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;
    save_metadata_store(&notes_dir, &store)?;

    let mut notes = Vec::new();

    for entry in fs::read_dir(&notes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(id) = note_id_from_path(&path) else {
            continue;
        };
        let Ok(markdown) = fs::read_to_string(&path) else {
            continue;
        };
        let meta = metadata_for_id(&store, &id);
        notes.push(note_summary_from_parts(&path, id, &markdown, &meta)?);
    }

    notes.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
            .then_with(|| a.file_name.cmp(&b.file_name))
    });

    Ok(notes)
}

#[tauri::command]
pub fn read_note<R: Runtime>(app: AppHandle<R>, id: String) -> Result<NoteDocument, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let path = note_path_for_id(&notes_dir, &id)?;
    let markdown = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;
    let meta = metadata_for_id(&store, &id);
    note_document_from_parts(&path, id, markdown, &meta)
}

#[tauri::command]
pub fn create_note<R: Runtime>(app: AppHandle<R>) -> Result<NoteDocument, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let id = fresh_note_id(&notes_dir)?;
    let path = note_path_for_id(&notes_dir, &id)?;
    fs::write(&path, DEFAULT_NOTE_MARKDOWN).map_err(|e| e.to_string())?;

    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;
    let meta = default_metadata();
    store.notes.insert(id.clone(), meta.clone());
    save_metadata_store(&notes_dir, &store)?;

    note_document_from_parts(&path, id, DEFAULT_NOTE_MARKDOWN.to_string(), &meta)
}

#[tauri::command]
pub fn update_note<R: Runtime>(
    app: AppHandle<R>,
    note: NoteDocument,
) -> Result<NoteDocument, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let path = note_path_for_id(&notes_dir, &note.id)?;
    fs::write(&path, &note.markdown).map_err(|e| e.to_string())?;

    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;
    let mut meta = metadata_for_id(&store, &note.id);
    meta.updated_at = now_secs();
    meta.is_starred = note.is_starred;
    meta.tags = note.tags.clone();
    store.notes.insert(note.id.clone(), meta.clone());
    save_metadata_store(&notes_dir, &store)?;

    note_document_from_parts(&path, note.id, note.markdown, &meta)
}

#[tauri::command]
pub fn save_note<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    markdown: String,
) -> Result<NoteSummary, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let path = note_path_for_id(&notes_dir, &id)?;
    fs::write(&path, &markdown).map_err(|e| e.to_string())?;

    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;
    let mut meta = metadata_for_id(&store, &id);
    meta.updated_at = now_secs();
    store.notes.insert(id.clone(), meta.clone());
    save_metadata_store(&notes_dir, &store)?;

    note_summary_from_parts(&path, id, &markdown, &meta)
}

fn is_importable_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
}

/// Turn a note title into a file name safe to write into the share temp directory.
fn share_file_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '\0' => ' ',
            _ => ch,
        })
        .collect();
    let mut name = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_start_matches('.')
        .trim()
        .to_string();
    if name.is_empty() {
        name = "Untitled".to_string();
    }

    format!("{name}.{NOTE_EXTENSION}")
}

/// Receiving apps display the shared file's name, so hand them a temp copy named after the
/// note's title instead of the opaque `note-<timestamp>` id the notes directory uses.
fn write_share_copy(title: &str, markdown: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("notetaker-share");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(share_file_name(title));
    fs::write(&path, markdown).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub fn share_note<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    anchor_x: f64,
    anchor_y: f64,
) -> Result<(), String> {
    let notes_dir = ensure_notes_path(&app)?;
    let path = note_path_for_id(&notes_dir, &id)?;
    if !path.is_file() {
        return Err("Note file not found".to_string());
    }

    let markdown = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let share_path = write_share_copy(&title_from_markdown(&markdown), &markdown)?;

    #[cfg(target_os = "macos")]
    {
        use std::sync::mpsc;

        let win = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "Floating note window not found".to_string())?;
        let path_string = share_path.to_string_lossy().into_owned();
        let (tx, rx) = mpsc::channel();

        app.run_on_main_thread(move || {
            let result = crate::share_note_file_at_anchor(
                &win,
                std::path::Path::new(&path_string),
                anchor_x,
                anchor_y,
            );
            let _ = tx.send(result);
        })
        .map_err(|error| error.to_string())?;

        return rx.recv().map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_opener::OpenerExt;

        app.opener()
            .open_path(share_path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn import_markdown_files<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> Result<Vec<NoteSummary>, String> {
    let notes_dir = ensure_notes_path(&app)?;
    let mut store = load_metadata_store(&notes_dir)?;
    reconcile_metadata_store(&mut store, &notes_dir)?;

    let mut imported = Vec::new();

    for path_string in paths {
        let source = PathBuf::from(path_string);
        if !source.is_file() || !is_importable_extension(&source) {
            continue;
        }

        let markdown = fs::read_to_string(&source).map_err(|error| error.to_string())?;
        let id = fresh_note_id(&notes_dir)?;
        let dest = note_path_for_id(&notes_dir, &id)?;
        fs::write(&dest, &markdown).map_err(|error| error.to_string())?;

        let meta = default_metadata();
        store.notes.insert(id.clone(), meta.clone());
        imported.push(note_summary_from_parts(&dest, id, &markdown, &meta)?);
    }

    save_metadata_store(&notes_dir, &store)?;
    Ok(imported)
}

#[tauri::command]
pub fn delete_note<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let notes_dir = ensure_notes_path(&app)?;
    let path = note_path_for_id(&notes_dir, &id)?;
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }

    let mut store = load_metadata_store(&notes_dir)?;
    store.notes.remove(&id);
    save_metadata_store(&notes_dir, &store)?;

    Ok(())
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
            if crate::is_notepad_key_window(&win) {
                close_notepad(app, &win)
            } else {
                show_notepad(app, &win)
            }
        } else {
            show_notepad(app, &win)
        }
    } else {
        create_and_show_notepad(app)
    }
}

#[tauri::command]
pub fn close_notepad_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(LABEL) {
        close_notepad(&app, &win)
    } else {
        Ok(())
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
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(PathBuf::from("floating-note.html")))
            .title("Quick Note")
            .inner_size(geometry.width, geometry.height)
            .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
            .position(geometry.x, geometry.y)
            .visible(false)
            .focused(false);

    // Keep the native decorations/`Titled` style mask: macOS only floats `FullScreenAuxiliary`
    // panels over other apps' fullscreen spaces while they stay titled. The titlebar is made
    // invisible (transparent + hidden buttons + full-size content) in `configure_fullscreen_overlay`,
    // so the window still looks chromeless. Do not add `.decorations(false)` here.
    #[cfg(target_os = "macos")]
    let builder = builder.transparent(true);

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "macos"))]
    let builder = builder.visible_on_all_workspaces(true).always_on_top(true);

    let win = builder.build().map_err(|e| e.to_string())?;
    if crate::settings::hide_on_screen_share_enabled(app) {
        if let Err(error) = win.set_content_protected(true) {
            eprintln!("floating-note content protection: {error}");
        }
    }
    #[cfg(target_os = "macos")]
    if let Err(error) = crate::apply_notepad_vibrancy(app, &win) {
        eprintln!("floating-note backdrop: {error}");
    }
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
