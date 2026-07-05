import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type BackdropMode = "glass" | "blur";

export interface AppSettings {
	accentColor: string;
	backdropMode: BackdropMode;
	pasteWithFormatting: boolean;
	hideOnScreenShare: boolean;
	strikeCompletedTasks: boolean;
	/** Shortcut overrides by action id; actions without an entry use the built-in defaults. */
	shortcuts: Record<string, string>;
	notesDirectory: string;
}

const ACCENT_CHANGED_EVENT = "settings://accent-changed";

export function getSettings() {
	return invoke<AppSettings>("get_settings");
}

export function setAccentColor(color: string) {
	return invoke<void>("set_accent_color", { color });
}

export function setBackdropMode(backdropMode: BackdropMode) {
	return invoke<void>("set_backdrop_mode", { backdropMode });
}

export function setPasteWithFormatting(pasteWithFormatting: boolean) {
	return invoke<void>("set_paste_with_formatting", { pasteWithFormatting });
}

export function setHideOnScreenShare(hideOnScreenShare: boolean) {
	return invoke<void>("set_hide_on_screen_share", { hideOnScreenShare });
}

export function setStrikeCompletedTasks(strikeCompletedTasks: boolean) {
	return invoke<void>("set_strike_completed_tasks", { strikeCompletedTasks });
}

/** Persist a shortcut override; pass null to clear it back to the default. */
export function setShortcut(action: string, shortcut: string | null) {
	return invoke<void>("set_shortcut", { action, shortcut });
}

export function revealNotesDirectory() {
	return invoke<void>("reveal_notes_directory");
}

export function openSettings() {
	return invoke<void>("open_settings");
}

export function closeNotepad() {
	return invoke<void>("close_notepad_command");
}

/** Convert `#rgb` / `#rrggbb` to the space-separated channel triplet CSS `rgb()` expects. */
export function hexToRgbChannels(hex: string): string | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) {
		return null;
	}

	let value = match[1];
	if (value.length === 3) {
		value = value
			.split("")
			.map((char) => char + char)
			.join("");
	}

	const int = Number.parseInt(value, 16);
	return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * Set the `--color-accent` custom property the whole UI reads from. Every accent-colored Tailwind
 * class is written as `rgb(var(--color-accent) / <alpha>)`, so updating this one variable recolors
 * the app without touching any class names.
 */
export function applyAccent(hex: string) {
	// const channels = hexToRgbChannels(hex);
	document.documentElement.style.setProperty("--color-accent", hex);
}

/**
 * Load the persisted accent for this window and keep it in sync with other windows. Called once per
 * window at startup; the returned unlisten is generally left for the window's lifetime.
 */
export async function initAccentTheme(): Promise<UnlistenFn | undefined> {
	try {
		const settings = await getSettings();
		applyAccent(settings.accentColor);
	} catch {
		// Fall back to the CSS default already on :root.
	}

	try {
		return await listen<string>(ACCENT_CHANGED_EVENT, (event) => {
			applyAccent(event.payload);
		});
	} catch {
		return undefined;
	}
}
