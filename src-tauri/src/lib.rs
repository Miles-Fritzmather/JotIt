// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod notepad;

/// Apply always-on-top / workspace overlay behavior used by the floating notepad (`notepad`).
/// Invoked only from Rust; never exposed over IPC so the UI cannot change this surface.
pub(crate) fn apply_notepad_overlay<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
	window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
	window
		.set_always_on_top(true)
		.map_err(|e| e.to_string())?;

	#[cfg(target_os = "macos")]
	{
		window
			.set_visible_on_all_workspaces(true)
			.map_err(|e| e.to_string())?;
		macos::configure_fullscreen_overlay(window).map_err(|e| e.to_string())?;
		app.set_activation_policy(tauri::ActivationPolicy::Regular)
			.map_err(|e| e.to_string())?;
	}

	#[cfg(not(target_os = "macos"))]
	{
		let _ = app;
		window
			.set_visible_on_all_workspaces(true)
			.map_err(|e| e.to_string())?;
	}

	Ok(())
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

pub(crate) fn try_activate_first_foreign_visible() -> bool {
	#[cfg(target_os = "macos")]
	{
		return macos::try_activate_first_visible_foreign_candidate();
	}
	#[cfg(not(target_os = "macos"))]
	false
}

#[cfg(target_os = "macos")]
mod macos {
	use objc2_app_kit::{
		NSApplicationActivationOptions, NSApplicationActivationPolicy, NSRunningApplication,
		NSWorkspace,
	};
	use objc2::{class, msg_send, runtime::AnyObject};

	const OVERLAY_WINDOW_LEVEL: isize = 10_000;
	const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
	const STATIONARY: usize = 1 << 4;
	const FULL_SCREEN_AUXILIARY: usize = 1 << 8;

	pub(super) fn configure_fullscreen_overlay<R: tauri::Runtime>(
		window: &tauri::WebviewWindow<R>,
	) -> tauri::Result<()> {
		let ns_window = window.ns_window()?;

		unsafe {
			let ns_window = ns_window.cast::<AnyObject>();
			let _: () = msg_send![ns_window, setLevel: OVERLAY_WINDOW_LEVEL];

			let behavior = CAN_JOIN_ALL_SPACES | STATIONARY | FULL_SCREEN_AUXILIARY;
			let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
		}

		Ok(())
	}

	pub(super) fn deactivate_application() {
		unsafe {
			let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
			let _: () = msg_send![app, deactivate];
		}
	}

	pub(super) fn first_visible_foreign_candidate_pid() -> Option<i32> {
		let ours = std::process::id() as i32;
		let workspace = NSWorkspace::sharedWorkspace();
		let apps = workspace.runningApplications();
		let n = apps.count();
		let n = usize::try_from(n).unwrap_or(0);

		for idx in 0..n {
			let ra = apps.objectAtIndex(idx as _);
			let pid = ra.processIdentifier();
			if pid <= 0 || pid == ours {
				continue;
			}
			if ra.isTerminated() {
				continue;
			}
			if ra.isHidden() {
				continue;
			}
			if ra.activationPolicy() != NSApplicationActivationPolicy::Regular {
				continue;
			}
			return Some(pid);
		}

		None
	}

	pub(super) fn try_activate_first_visible_foreign_candidate() -> bool {
		let Some(pid) = first_visible_foreign_candidate_pid() else {
			return false;
		};
		activate_pid(pid)
	}

	pub(super) fn activate_pid(pid: i32) -> bool {
		if pid <= 0 {
			return false;
		}
		let Some(target) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) else {
			return false;
		};
		#[allow(deprecated)]
		let options = NSApplicationActivationOptions::ActivateAllWindows.union(
			NSApplicationActivationOptions::ActivateIgnoringOtherApps,
		);
		target.activateWithOptions(options)
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let builder = tauri::Builder::default();
	#[cfg(not(any(target_os = "android", target_os = "ios")))]
	let builder = builder.plugin(notepad::shortcut_plugin());

	builder
		.plugin(tauri_plugin_opener::init())
		.setup(|app| {
			#[cfg(target_os = "macos")]
			app.handle()
				.set_activation_policy(tauri::ActivationPolicy::Regular)?;

			tauri::WebviewWindowBuilder::new(
				app,
				"main",
				tauri::WebviewUrl::App("index.html".into()),
			)
			.title("notetaker")
			.inner_size(800.0, 600.0)
			.build()?;

			#[cfg(not(any(target_os = "android", target_os = "ios")))]
			if let Err(e) = notepad::prefetch_hidden(app.handle()) {
				eprintln!("floating-note prefetch: {e}");
			}

			Ok(())
		})
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
