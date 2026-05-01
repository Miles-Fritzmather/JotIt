//! Floating quick-note window driven entirely from the Rust process.
//! The main/settings webview does not create, show, hide, or register shortcuts for this window.

use std::{path::PathBuf};

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{ShortcutState, Builder as GlobalShortcutBuilder};

pub const LABEL: &str = "floating-note";

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
		if win.is_focused().unwrap_or(false) {
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
	if !crate::try_activate_first_foreign_visible() {
		if let Some(main) = app.get_webview_window("main") {
			let _ = main.set_focus();
		} else {
			crate::deactivate_app_shell();
		}
	}

	win.hide().map_err(|e| e.to_string())
}

fn show_notepad<R: Runtime>(
	app: &AppHandle<R>,
	win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
	crate::apply_notepad_overlay(app, win)?;
	win.show().map_err(|e| e.to_string())?;
	win.set_focus().map_err(|e| e.to_string())?;
	Ok(())
}

fn build_notepad_window<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::WebviewWindow<R>, String> {
	WebviewWindowBuilder::new(
		app,
		LABEL,
		WebviewUrl::App(PathBuf::from("floating-note")),
	)
	.title("Quick Note")
	.inner_size(600.0, 500.0)
	.position(100.0, 100.0)
	.always_on_top(true)
	.visible_on_all_workspaces(true)
	.visible(false)
	.focused(false)
	.build()
	.map_err(|e| e.to_string())
}

fn apply_overlay_then_show_focus<R: Runtime>(
	app: &AppHandle<R>,
	win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
	crate::apply_notepad_overlay(app, win)?;
	win.show().map_err(|e| e.to_string())?;
	win.set_focus().map_err(|e| e.to_string())?;
	Ok(())
}

/// Build the floating webview once at startup; keep it hidden until the shortcut shows it.
/// Skips [`crate::prepare_notepad_create_activation_policy`] so the main window does not see an
/// auxiliary activation-policy flicker at launch (that path is reserved for spawning from shortcut).
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
