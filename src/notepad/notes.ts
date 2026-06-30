import { invoke } from "@tauri-apps/api/core";

export interface NoteSummary {
	id: string;
	title: string;
	fileName: string;
	updatedAt: number;
	isStarred: boolean;
	tags: string[];
}

export interface NoteDocument extends NoteSummary {
	markdown: string;
}

export function titleFromMarkdown(markdown: string) {
	for (const line of markdown.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("# ")) {
			continue;
		}

		const title = normalizeTitle(trimmed.slice(2).replace(/#+$/u, ""));
		if (title) {
			return title;
		}
	}

	for (const line of markdown.split(/\r?\n/)) {
		const title = normalizeTitle(line.replace(/^[#>*_` -]+/u, ""));
		if (title) {
			return title;
		}
	}

	return "Untitled";
}

export function noteSummaryFromDocument(note: NoteDocument): NoteSummary {
	const { id, title, fileName, updatedAt, isStarred = false, tags = [] } = note;
	return { id, title, fileName, updatedAt, isStarred, tags };
}

export function listNotes() {
	return invoke<NoteSummary[]>("list_notes");
}

export function readNote(id: string) {
	return invoke<NoteDocument>("read_note", { id });
}

export function createNote() {
	return invoke<NoteDocument>("create_note");
}

export function updateNote(note: NoteDocument) {
	return invoke<NoteDocument>("update_note", { note });
}

export function saveNote(id: string, markdown: string) {
	return invoke<NoteSummary>("save_note", { id, markdown });
}

export function deleteNote(id: string) {
	return invoke<void>("delete_note", { id });
}

function normalizeTitle(value: string) {
	const title = value.trim().split(/\s+/u).filter(Boolean).join(" ");
	if (!title) {
		return null;
	}

	return title.length > 80 ? `${title.slice(0, 80)}...` : title;
}
