/**
 * Configurable keyboard shortcuts.
 *
 * Bindings are stored as canonical strings like "Cmd+Shift+X" or "Ctrl+Shift+J": modifier tokens
 * (Ctrl, Alt, Shift, Cmd) joined with "+" and ending in one key token. Key tokens are uppercase
 * letters/digits or W3C-code-style names (Comma, Period, Slash, ArrowUp, F5, …) — the same names
 * the Rust global-shortcut parser accepts, so one format works everywhere.
 *
 * Overrides persist in app settings; anything not overridden falls back to the defaults below.
 */

export type ShortcutActionId =
	| "toggleNotepad"
	| "newNote"
	| "searchPanel"
	| "findInNote"
	| "openSettings"
	| "deleteNote"
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "inlineCode"
	| "link"
	| "quoteBlock"
	| "codeBlock"
	| "mathBlock"
	| "monofontBlock"
	| "bulletList"
	| "todoList";

export interface ShortcutDefinition {
	id: ShortcutActionId;
	label: string;
	group: "General" | "Formatting";
	defaultBinding: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
	{
		id: "toggleNotepad",
		label: "Open / close notepad",
		group: "General",
		defaultBinding: "Ctrl+Shift+J",
	},
	{ id: "newNote", label: "New note", group: "General", defaultBinding: "Cmd+N" },
	{
		id: "searchPanel",
		label: "Search notes",
		group: "General",
		defaultBinding: "Cmd+P",
	},
	{
		id: "findInNote",
		label: "Find in note",
		group: "General",
		defaultBinding: "Cmd+F",
	},
	{
		id: "openSettings",
		label: "Open settings",
		group: "General",
		defaultBinding: "Cmd+Comma",
	},
	{
		id: "deleteNote",
		label: "Delete note",
		group: "General",
		defaultBinding: "Ctrl+X",
	},
	{ id: "bold", label: "Bold", group: "Formatting", defaultBinding: "Cmd+B" },
	{ id: "italic", label: "Italic", group: "Formatting", defaultBinding: "Cmd+I" },
	{
		id: "underline",
		label: "Underline",
		group: "Formatting",
		defaultBinding: "Cmd+U",
	},
	{
		id: "strikethrough",
		label: "Strikethrough",
		group: "Formatting",
		defaultBinding: "Cmd+Shift+X",
	},
	{
		id: "inlineCode",
		label: "Inline code",
		group: "Formatting",
		defaultBinding: "Cmd+E",
	},
	{ id: "link", label: "Link", group: "Formatting", defaultBinding: "Cmd+K" },
	{
		id: "quoteBlock",
		label: "Quote block",
		group: "Formatting",
		defaultBinding: "Cmd+Shift+B",
	},
	{
		id: "codeBlock",
		label: "Code block",
		group: "Formatting",
		defaultBinding: "Cmd+Alt+C",
	},
	{
		id: "mathBlock",
		label: "Math block",
		group: "Formatting",
		defaultBinding: "Cmd+Alt+M",
	},
	{
		id: "monofontBlock",
		label: "Monospace block",
		group: "Formatting",
		defaultBinding: "Cmd+Alt+T",
	},
	{
		id: "bulletList",
		label: "Bullet list",
		group: "Formatting",
		defaultBinding: "Cmd+Shift+8",
	},
	{
		id: "todoList",
		label: "To-do list",
		group: "Formatting",
		defaultBinding: "Cmd+Shift+9",
	},
];

const DEFAULT_BINDINGS: Record<string, string> = Object.fromEntries(
	SHORTCUT_DEFINITIONS.map((definition) => [
		definition.id,
		definition.defaultBinding,
	]),
);

/** event.key → canonical token, for keys whose `key` value isn't the token itself. */
const KEY_TO_TOKEN: Record<string, string> = {
	",": "Comma",
	".": "Period",
	"/": "Slash",
	";": "Semicolon",
	"'": "Quote",
	"[": "BracketLeft",
	"]": "BracketRight",
	"\\": "Backslash",
	"-": "Minus",
	"=": "Equal",
	"`": "Backquote",
	" ": "Space",
};

/** canonical token → display glyph. */
const TOKEN_TO_DISPLAY: Record<string, string> = {
	Comma: ",",
	Period: ".",
	Slash: "/",
	Semicolon: ";",
	Quote: "'",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Minus: "-",
	Equal: "=",
	Backquote: "`",
	Space: "␣",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Enter: "↩",
	Backspace: "⌫",
	Tab: "⇥",
};

interface ParsedShortcut {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
	key: string;
}

export function parseShortcut(binding: string): ParsedShortcut | null {
	const parsed: ParsedShortcut = {
		ctrl: false,
		alt: false,
		shift: false,
		meta: false,
		key: "",
	};

	for (const part of binding.split("+")) {
		const token = part.trim();
		if (!token) {
			continue;
		}
		const lower = token.toLowerCase();
		if (lower === "ctrl" || lower === "control") {
			parsed.ctrl = true;
		} else if (lower === "alt" || lower === "option") {
			parsed.alt = true;
		} else if (lower === "shift") {
			parsed.shift = true;
		} else if (
			lower === "cmd" ||
			lower === "command" ||
			lower === "meta" ||
			lower === "super"
		) {
			parsed.meta = true;
		} else {
			parsed.key = token.length === 1 ? token.toUpperCase() : token;
		}
	}

	return parsed.key ? parsed : null;
}

/**
 * The canonical key token for a keyboard event. Letters and digits come from event.code so
 * Shift (e.g. Shift+8 → "*") and keyboard layout quirks don't change the token; everything else
 * falls back through the key map.
 */
function eventKeyToken(event: KeyboardEvent): string | null {
	const { code, key } = event;
	if (/^Key[A-Z]$/.test(code)) {
		return code.slice(3);
	}
	if (/^Digit[0-9]$/.test(code)) {
		return code.slice(5);
	}
	if (key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") {
		return null;
	}
	const mapped = KEY_TO_TOKEN[key];
	if (mapped) {
		return mapped;
	}
	return key.length === 1 ? key.toUpperCase() : key;
}

export function bindingMatchesEvent(
	binding: string,
	event: KeyboardEvent,
): boolean {
	const parsed = parseShortcut(binding);
	if (!parsed) {
		return false;
	}

	if (
		event.ctrlKey !== parsed.ctrl ||
		event.altKey !== parsed.alt ||
		event.shiftKey !== parsed.shift ||
		event.metaKey !== parsed.meta
	) {
		return false;
	}

	const token = eventKeyToken(event);
	return token !== null && token.toLowerCase() === parsed.key.toLowerCase();
}

/**
 * Canonical binding string for a recorder keydown, or null if the event can't be a shortcut
 * (modifier-only presses, and Escape which is reserved for cancelling).
 */
export function bindingFromEvent(event: KeyboardEvent): string | null {
	if (event.key === "Escape") {
		return null;
	}

	const token = eventKeyToken(event);
	if (!token) {
		return null;
	}

	const parts: string[] = [];
	if (event.ctrlKey) {
		parts.push("Ctrl");
	}
	if (event.altKey) {
		parts.push("Alt");
	}
	if (event.shiftKey) {
		parts.push("Shift");
	}
	if (event.metaKey) {
		parts.push("Cmd");
	}
	parts.push(token);
	return parts.join("+");
}

/** Render a binding with macOS modifier glyphs, e.g. "Cmd+Shift+X" → "⌘⇧X". */
export function displayShortcut(binding: string): string {
	const parsed = parseShortcut(binding);
	if (!parsed) {
		return binding;
	}

	let display = "";
	if (parsed.ctrl) {
		display += "⌃";
	}
	if (parsed.alt) {
		display += "⌥";
	}
	if (parsed.shift) {
		display += "⇧";
	}
	if (parsed.meta) {
		display += "⌘";
	}
	return display + (TOKEN_TO_DISPLAY[parsed.key] ?? parsed.key);
}

// ── Override store ──
// Module-level so both React components and non-React code (ProseMirror keymaps, window keydown
// handlers) read the live bindings without threading props around.

let overrides: Record<string, string> = {};
const listeners = new Set<() => void>();

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

export function setShortcutOverrides(
	next: Record<string, string> | undefined,
) {
	overrides = { ...(next ?? {}) };
	notify();
}

export function setShortcutOverride(
	id: ShortcutActionId,
	binding: string | null,
) {
	if (binding === null) {
		delete overrides[id];
	} else {
		overrides[id] = binding;
	}
	notify();
}

export function subscribeShortcuts(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getShortcutBinding(id: ShortcutActionId): string {
	return overrides[id] ?? DEFAULT_BINDINGS[id];
}

export function isShortcutOverridden(id: ShortcutActionId): boolean {
	return id in overrides && overrides[id] !== DEFAULT_BINDINGS[id];
}

export function shortcutMatches(
	id: ShortcutActionId,
	event: KeyboardEvent,
): boolean {
	return bindingMatchesEvent(getShortcutBinding(id), event);
}
