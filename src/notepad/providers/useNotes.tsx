import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { PendingSave } from "../lib/types";
import { messageFromError } from "../lib/utils";
import {
	createNote,
	deleteNote,
	listNotes,
	NoteDocument,
	NoteMetadata,
	NoteSummary,
	noteSummaryFromDocument,
	pickAndImportMarkdownFiles,
	readNote,
	updateNote,
	saveNote,
	titleFromMarkdown,
} from "../notes";
import { useErrors } from "./useErrors";

type NotesContextType = {
	notes: NoteSummary[];
	activeNote: NoteDocument | null;
	isLoading: boolean;
	pendingSave: PendingSave | null;
	saveTimer: number | null;
	cycleNote: (direction: -1 | 1) => void;
	createNewNote: () => void;
	deleteActiveNote: () => void;
	importMarkdownFiles: () => Promise<void>;
	loadNote: (id: string) => void;
	handleMarkdownChange: (noteId: string, markdown: string) => void;
	savePendingNow: () => Promise<boolean>;
	scheduleSave: (id: string, markdown: string) => void;
	clearSaveTimer: () => void;
	updateNoteMetadata: (
		noteId: string,
		metadata: Partial<NoteMetadata>,
	) => Promise<void>;
};

const NotesContext = createContext<NotesContextType | null>(null);

function mergeNoteSummary(notes: NoteSummary[], summary: NoteSummary) {
	const next = notes.some((note) => note.id === summary.id)
		? notes.map((note) => (note.id === summary.id ? summary : note))
		: [summary, ...notes];

	return next;
}

const NotesProvider = ({
	children,
	saveDelayMs = 500,
}: {
	children: React.ReactNode;
	saveDelayMs?: number;
}) => {
	const { setError } = useErrors();
	const [notes, setNotes] = useState<NoteSummary[]>([]);
	const [activeNote, setActiveNote] = useState<NoteDocument | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const activeNoteRef = useRef<NoteDocument | null>(null);
	const notesRef = useRef<NoteSummary[]>([]);
	const pendingSaveRef = useRef<PendingSave | null>(null);
	const saveTimerRef = useRef<number | null>(null);

	useEffect(() => {
		activeNoteRef.current = activeNote;
	}, [activeNote]);

	useEffect(() => {
		notesRef.current = notes;
	}, [notes]);

	const applySavedSummary = useCallback((summary: NoteSummary) => {
		setNotes((currentNotes) => mergeNoteSummary(currentNotes, summary));
		setActiveNote((currentNote) =>
			currentNote?.id === summary.id
				? {
						...currentNote,
						title: summary.title,
						fileName: summary.fileName,
						updatedAt: summary.updatedAt,
						isStarred: summary.isStarred,
						tags: summary.tags,
					}
				: currentNote,
		);
	}, []);

	const clearSaveTimer = useCallback(() => {
		if (saveTimerRef.current !== null) {
			window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
	}, []);

	const savePendingNow = useCallback(async () => {
		const pending = pendingSaveRef.current;
		if (!pending) {
			return true;
		}

		pendingSaveRef.current = null;
		clearSaveTimer();

		try {
			const summary = await saveNote(pending.id, pending.markdown);
			applySavedSummary(summary);
			setError(null);
			return true;
		} catch (saveError) {
			if (!pendingSaveRef.current) {
				pendingSaveRef.current = pending;
			}
			setError(`Could not save note: ${messageFromError(saveError)}`);
			return false;
		}
	}, [applySavedSummary, clearSaveTimer]);

	useEffect(() => {
		const handleBeforeUnload = () => {
			const pending = pendingSaveRef.current;
			if (pending) {
				void saveNote(pending.id, pending.markdown);
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			clearSaveTimer();
		};
	}, [clearSaveTimer]);

	const createNewNote = useCallback(async () => {
		const saved = await savePendingNow();
		if (!saved) {
			return;
		}

		try {
			const note = await createNote();
			setActiveNote(note);
			setNotes((currentNotes) => [
				noteSummaryFromDocument(note),
				...currentNotes.filter((existing) => existing.id !== note.id),
			]);
			setError(null);
		} catch (createError) {
			setError(`Could not create note: ${messageFromError(createError)}`);
		}
	}, [savePendingNow]);

	const loadNote = useCallback(
		async (id: string) => {
			if (activeNoteRef.current?.id === id) return;

			const saved = await savePendingNow();
			if (!saved) {
				return;
			}

			try {
				const note = await readNote(id);
				setActiveNote(note);
				setNotes((currentNotes) =>
					mergeNoteSummary(currentNotes, noteSummaryFromDocument(note)),
				);
				setError(null);
			} catch (loadError) {
				setError(`Could not load note: ${messageFromError(loadError)}`);
			}
		},
		[savePendingNow],
	);

	const cycleNote = useCallback(
		(direction: -1 | 1) => {
			const currentNotes = notesRef.current;
			const currentNote = activeNoteRef.current;
			if (!currentNote || currentNotes.length < 2) {
				return;
			}

			const activeIndex = currentNotes.findIndex(
				(note) => note.id === currentNote.id,
			);
			if (activeIndex === -1) {
				return;
			}

			const nextIndex =
				(activeIndex + direction + currentNotes.length) % currentNotes.length;
			void loadNote(currentNotes[nextIndex].id);
		},
		[loadNote],
	);

	const scheduleSave = useCallback(
		(id: string, markdown: string) => {
			pendingSaveRef.current = { id, markdown };
			clearSaveTimer();
			saveTimerRef.current = window.setTimeout(() => {
				saveTimerRef.current = null;
				void savePendingNow();
			}, saveDelayMs);
		},
		[clearSaveTimer, savePendingNow],
	);

	const handleMarkdownChange = useCallback(
		(noteId: string, markdown: string) => {
			const title = titleFromMarkdown(markdown);
			setActiveNote((currentNote) =>
				currentNote?.id === noteId ? { ...currentNote, title } : currentNote,
			);
			setNotes((currentNotes) =>
				currentNotes.map((note) =>
					note.id === noteId ? { ...note, title } : note,
				),
			);
			scheduleSave(noteId, markdown);
		},
		[scheduleSave],
	);

	useEffect(() => {
		let disposed = false;

		async function loadInitialNote() {
			setIsLoading(true);
			try {
				const storedNotes = await listNotes();
				const note =
					storedNotes.length > 0
						? await readNote(storedNotes[0].id)
						: await createNote();

				if (disposed) {
					return;
				}

				setNotes(
					storedNotes.length > 0
						? storedNotes
						: [noteSummaryFromDocument(note)],
				);
				setActiveNote(note);
				setError(null);
			} catch (loadError) {
				if (!disposed) {
					setError(`Could not load notes: ${messageFromError(loadError)}`);
				}
			} finally {
				if (!disposed) {
					setIsLoading(false);
				}
			}
		}

		void loadInitialNote();

		return () => {
			disposed = true;
		};
	}, []);

	const deleteActiveNote = useCallback(async () => {
		const current = activeNoteRef.current;
		if (!current) {
			return;
		}

		// Drop any queued autosave for this note first — otherwise the debounced write would
		// recreate the file we are about to delete.
		if (pendingSaveRef.current?.id === current.id) {
			pendingSaveRef.current = null;
		}
		clearSaveTimer();

		try {
			await deleteNote(current.id);
		} catch (deleteError) {
			setError(`Could not delete note: ${messageFromError(deleteError)}`);
			return;
		}

		const remaining = notesRef.current.filter((note) => note.id !== current.id);
		setNotes(remaining);

		try {
			const nextNote =
				remaining.length > 0
					? await readNote(remaining[0].id)
					: await createNote();

			setActiveNote(nextNote);
			if (remaining.length === 0) {
				setNotes([noteSummaryFromDocument(nextNote)]);
			}
			setError(null);
		} catch (loadError) {
			setActiveNote(null);
			setError(`Could not open another note: ${messageFromError(loadError)}`);
		}
	}, [clearSaveTimer]);

	const importMarkdownFiles = useCallback(async () => {
		const saved = await savePendingNow();
		if (!saved) return;
		try {
			const imported = await pickAndImportMarkdownFiles();
			if (imported.length === 0) return;
			const storedNotes = await listNotes();
			setNotes(storedNotes);
			await loadNote(imported[0].id);
			setError(null);
		} catch (importError) {
			setError(`Could not import files: ${messageFromError(importError)}`);
		}
	}, [loadNote, savePendingNow, setError]);

	const updateNoteMetadata = useCallback(
		async (noteId: string, metadata: Partial<NoteMetadata>) => {
			const existing = notesRef.current.find((note) => note.id === noteId);
			if (!existing) {
				return;
			}

			const previousMeta: NoteMetadata = {
				isStarred: existing.isStarred,
				tags: existing.tags,
			};
			const nextMeta: NoteMetadata = { ...previousMeta, ...metadata };

			setNotes((currentNotes) =>
				currentNotes.map((note) =>
					note.id === noteId ? { ...note, ...nextMeta } : note,
				),
			);
			setActiveNote((currentNote) =>
				currentNote?.id === noteId ? { ...currentNote, ...nextMeta } : currentNote,
			);

			try {
				const currentDoc =
					activeNoteRef.current?.id === noteId
						? activeNoteRef.current
						: await readNote(noteId);
				if (!currentDoc) {
					return;
				}

				const updated = await updateNote({
					...currentDoc,
					...nextMeta,
				});
				applySavedSummary(noteSummaryFromDocument(updated));
				setError(null);
			} catch (updateError) {
				setNotes((currentNotes) =>
					currentNotes.map((note) =>
						note.id === noteId ? { ...note, ...previousMeta } : note,
					),
				);
				setActiveNote((currentNote) =>
					currentNote?.id === noteId
						? { ...currentNote, ...previousMeta }
						: currentNote,
				);
				setError(`Could not update note metadata: ${messageFromError(updateError)}`);
			}
		},
		[applySavedSummary],
	);

	const value = useMemo(() => {
		return {
			notes,
			activeNote,
			isLoading,
			pendingSave: pendingSaveRef.current,
			saveTimer: saveTimerRef.current,
			cycleNote,
			createNewNote,
			deleteActiveNote,
			importMarkdownFiles,
			loadNote,
			handleMarkdownChange,
			savePendingNow,
			scheduleSave,
			clearSaveTimer,
			updateNoteMetadata,
		};
	}, [
		notes,
		activeNote,
		isLoading,
		pendingSaveRef.current,
		saveTimerRef.current,
	]);

	return (
		<NotesContext.Provider value={value}>{children}</NotesContext.Provider>
	);
};

const useNotes = () => {
	const notes = useContext(NotesContext);
	if (!notes) {
		throw new Error("useNotes must be used within a NotesProvider");
	}
	return notes;
};

export { NotesProvider, useNotes };
