import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type NoteSummary = {
	id: string;
	title: string;
	fileName: string;
	updatedAt: number;
} & NoteMetadata;

export type NoteMetadata = {
	isStarred: boolean;
	tags: string[];
};

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

export function shareNote(id: string, anchorX: number, anchorY: number) {
	return invoke<void>("share_note", { id, anchorX, anchorY });
}

export function importMarkdownFiles(paths: string[]) {
	return invoke<NoteSummary[]>("import_markdown_files", { paths });
}

export async function pickAndImportMarkdownFiles() {
	const selected = await open({
		multiple: true,
		filters: [
			{ name: "Markdown", extensions: ["md", "markdown", "txt"] },
		],
	});
	if (!selected) {
		return [];
	}
	const paths = Array.isArray(selected) ? selected : [selected];
	return importMarkdownFiles(paths);
}

function normalizeTitle(value: string) {
	const title = value.trim().split(/\s+/u).filter(Boolean).join(" ");
	if (!title) {
		return null;
	}

	return title.length > 80 ? `${title.slice(0, 80)}...` : title;
}
