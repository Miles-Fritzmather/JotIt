export const EDITOR_ZOOM_STORAGE_KEY = "notepad-editor-zoom";
export const EDITOR_ZOOM_MIN = 0.75;
export const EDITOR_ZOOM_MAX = 1.75;
export const EDITOR_ZOOM_STEP = 0.1;
export const EDITOR_ZOOM_DEFAULT = 1;

export function clampEditorZoom(value: number) {
	return Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, value));
}

export function loadEditorZoom() {
	try {
		const stored = localStorage.getItem(EDITOR_ZOOM_STORAGE_KEY);
		if (!stored) {
			return EDITOR_ZOOM_DEFAULT;
		}
		const parsed = Number.parseFloat(stored);
		return Number.isFinite(parsed)
			? clampEditorZoom(parsed)
			: EDITOR_ZOOM_DEFAULT;
	} catch {
		return EDITOR_ZOOM_DEFAULT;
	}
}

export function saveEditorZoom(value: number) {
	try {
		localStorage.setItem(EDITOR_ZOOM_STORAGE_KEY, String(value));
	} catch {
		// Ignore storage failures in private browsing, etc.
	}
}

export function stepEditorZoom(current: number, direction: 1 | -1) {
	const next = clampEditorZoom(
		Number((current + direction * EDITOR_ZOOM_STEP).toFixed(2)),
	);
	saveEditorZoom(next);
	return next;
}
