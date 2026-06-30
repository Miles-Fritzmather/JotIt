import { AlertTriangleIcon, SettingsIcon, StarIcon } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { openSettings } from "../theme";
import { HStack, Substack } from "./lib/helperdivs";
import { cn } from "./lib/utils";
import MDWrapper from "./markdown/wrapper";
import {
	createNote,
	deleteNote,
	listNotes,
	noteSummaryFromDocument,
	readNote,
	saveNote,
	titleFromMarkdown,
	type NoteDocument,
	type NoteSummary,
} from "./notes";
import "./styling/main.css";

export function blurNotepad() {
	const element = document.getElementById("floating-note-editor");
	if (element) {
		element.blur();
		return;
	}
}

const SAVE_DELAY_MS = 500;
const SEARCH_RESULT_LIMIT = 12;

interface PendingSave {
	id: string;
	markdown: string;
}

function messageFromError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function mergeNoteSummary(notes: NoteSummary[], summary: NoteSummary) {
	const next = notes.some((note) => note.id === summary.id)
		? notes.map((note) => (note.id === summary.id ? summary : note))
		: [summary, ...notes];

	return next;
}

const FloatingNoteEditor = () => {
	const [notes, setNotes] = useState<NoteSummary[]>([]);
	const [activeNote, setActiveNote] = useState<NoteDocument | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
	const activeNoteRef = useRef<NoteDocument | null>(null);
	const notesRef = useRef<NoteSummary[]>([]);
	const pendingSaveRef = useRef<PendingSave | null>(null);
	const saveTimerRef = useRef<number | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [showNoteIndicator, setShowNoteIndicator] = useState(false);
	const showNoteIndicatorTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [showError, setShowError] = useState(false);

	useEffect(() => {
		activeNoteRef.current = activeNote;
	}, [activeNote]);

	useEffect(() => {
		notesRef.current = notes;
	}, [notes]);

	const clearSaveTimer = useCallback(() => {
		if (saveTimerRef.current !== null) {
			window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
	}, []);

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
			displayError(`Could not save note: ${messageFromError(saveError)}`);
			return false;
		}
	}, [applySavedSummary, clearSaveTimer]);

	const scheduleSave = useCallback(
		(id: string, markdown: string) => {
			pendingSaveRef.current = { id, markdown };
			clearSaveTimer();
			saveTimerRef.current = window.setTimeout(() => {
				saveTimerRef.current = null;
				void savePendingNow();
			}, SAVE_DELAY_MS);
		},
		[clearSaveTimer, savePendingNow],
	);

	const loadNote = useCallback(
		async (id: string) => {
			if (activeNoteRef.current?.id === id) {
				setIsSearchOpen(false);
				return;
			}

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
				setIsSearchOpen(false);
				setSearchQuery("");
				setError(null);
				setShowNoteIndicator(true);
				if (showNoteIndicatorTimeoutRef.current) {
					clearTimeout(showNoteIndicatorTimeoutRef.current);
				}
				showNoteIndicatorTimeoutRef.current = setTimeout(() => {
					setShowNoteIndicator(false);
				}, 1000);
			} catch (loadError) {
				displayError(`Could not load note: ${messageFromError(loadError)}`);
			}
		},
		[savePendingNow],
	);

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
			setIsSearchOpen(false);
			setSearchQuery("");
			setError(null);
		} catch (createError) {
			displayError(`Could not create note: ${messageFromError(createError)}`);
		}
	}, [savePendingNow]);

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
			displayError(`Could not delete note: ${messageFromError(deleteError)}`);
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
			displayError(
				`Could not open another note: ${messageFromError(loadError)}`,
			);
		}
	}, [clearSaveTimer]);

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
					displayError(`Could not load notes: ${messageFromError(loadError)}`);
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

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const isMod = event.metaKey || event.ctrlKey;
			if (!isMod || event.shiftKey) {
				return;
			}

			// Ctrl+X (specifically Ctrl, not Cmd — leave Cmd+X as cut) opens the delete confirmation.
			if (
				event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				event.key.toLowerCase() === "x"
			) {
				event.preventDefault();
				event.stopPropagation();
				if (activeNoteRef.current) {
					setIsSearchOpen(false);
					setIsDeleteConfirmOpen(true);
				}
				return;
			}

			if (!event.altKey && event.key === ",") {
				event.preventDefault();
				event.stopPropagation();
				void openSettings();
				return;
			}

			if (!event.altKey && event.key.toLowerCase() === "n") {
				event.preventDefault();
				event.stopPropagation();
				void createNewNote();
				return;
			}

			if (!event.altKey && event.key.toLowerCase() === "p") {
				event.preventDefault();
				event.stopPropagation();
				setSearchQuery("");
				setHighlightedIndex(0);
				setIsSearchOpen(true);
				return;
			}

			if (event.altKey && event.key === "ArrowLeft") {
				event.preventDefault();
				event.stopPropagation();
				cycleNote(-1);
				return;
			}

			if (event.altKey && event.key === "ArrowRight") {
				event.preventDefault();
				event.stopPropagation();
				cycleNote(1);
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [createNewNote, cycleNote]);

	useEffect(() => {
		if (!isSearchOpen) {
			return;
		}

		window.requestAnimationFrame(() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		});
	}, [isSearchOpen]);

	useEffect(() => {
		if (!isDeleteConfirmOpen) {
			return;
		}

		const handleConfirmKeys = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setIsDeleteConfirmOpen(false);
				return;
			}

			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				setIsDeleteConfirmOpen(false);
				void deleteActiveNote();
			}
		};

		window.addEventListener("keydown", handleConfirmKeys, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleConfirmKeys, {
				capture: true,
			});
		};
	}, [isDeleteConfirmOpen, deleteActiveNote]);

	const filteredNotes = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const source = query
			? notes.filter((note) => note.title.toLowerCase().includes(query))
			: notes;

		return source.slice(0, SEARCH_RESULT_LIMIT);
	}, [notes, searchQuery]);

	useEffect(() => {
		setHighlightedIndex(0);
	}, [filteredNotes.length, searchQuery]);

	const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			setIsSearchOpen(false);
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlightedIndex((index) =>
				filteredNotes.length === 0 ? 0 : (index + 1) % filteredNotes.length,
			);
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlightedIndex((index) =>
				filteredNotes.length === 0
					? 0
					: (index - 1 + filteredNotes.length) % filteredNotes.length,
			);
			return;
		}

		if (event.key === "Enter") {
			event.preventDefault();
			const selectedNote = filteredNotes[highlightedIndex];
			if (selectedNote) {
				void loadNote(selectedNote.id);
			}
		}
	};

	function displayError(error: string) {
		setError(error);
		setShowError(true);
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
		}
		errorTimeoutRef.current = setTimeout(() => {
			errorTimeoutRef.current = null;
			setShowError(false);
		}, 5000);
	}

	const toggleStarNote = useCallback(async (noteId: string | undefined) => {
		if (!noteId) {
			return;
		}

		try {
			await toggleStarNote(noteId);
		} catch (error) {
			displayError(`Could not toggle star: ${messageFromError(error)}`);
		}
	}, []);

	return (
		<div id="floating-note-editor" className="border-4 border-accent/20">
			<div
				className="z-20 flex h-14 shrink-0 items-center justify-center border-b border-white/10 bg-white/04 cursor-grab bg-accent/2"
				data-tauri-drag-region
				aria-label="Drag to move note"
			>
				<HStack fillWidth gap={4} x="around" y="middle" className="mx-4">
					<Substack x="left">
						<button
							type="button"
							onClick={() => void toggleStarNote(activeNote?.id)}
						>
							<StarIcon
								strokeDasharray={activeNote?.isStarred ? "0" : "100"}
								className={"w-4 h-4 text-white/55"}
							/>
						</button>
						<div className="truncate text-left text-[12px] font-medium leading-none text-white/55">
							{activeNote?.title ?? "Notes"}
						</div>
					</Substack>
					<div
						aria-hidden="true"
						data-tauri-drag-region
						className="h-1 w-10 rounded-full bg-white/25"
					/>
					<button
						type="button"
						onClick={() => void openSettings()}
						aria-label="Open settings"
						title="Settings (⌘,)"
						className="h-7 w-7 rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white/90"
					>
						<SettingsIcon className="w-4 h-4" />
					</button>
				</HStack>
			</div>
			<HStack
				className={cn(
					"absolute inset-x-4 top-14 z-30 rounded-md border-2 border-error/85 bg-error/15 px-3 py-2 text-[12px] text-error transition-opacity duration-200",
					showError ? "opacity-100" : "opacity-0",
				)}
			>
				<AlertTriangleIcon className="w-4 h-4" />
				<span className="text-error">{error}</span>
			</HStack>
			{isSearchOpen ? (
				<div className="absolute inset-x-4 top-14 z-40 overflow-hidden rounded-lg border border-white/15 bg-neutral-950/10 backdrop-blur-2xl">
					<input
						ref={searchInputRef}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						onKeyDown={handleSearchKeyDown}
						className="h-11 w-full border-b border-white/10 bg-transparent px-4 text-[14px] text-white outline-none placeholder:text-white/35"
						placeholder="Search title"
						spellCheck={false}
					/>
					<div className="max-h-72 overflow-y-auto py-1">
						{filteredNotes.length > 0 ? (
							filteredNotes.map((note, index) => (
								<button
									key={note.id}
									type="button"
									onMouseEnter={() => setHighlightedIndex(index)}
									onClick={() => void loadNote(note.id)}
									className={[
										"flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] transition-colors",
										index === highlightedIndex
											? "bg-accent/18 text-white"
											: "text-white/72 hover:bg-white/10 hover:text-white",
									].join(" ")}
								>
									<span className="min-w-0 flex-1 truncate">{note.title}</span>
									{note.id === activeNote?.id ? (
										<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
									) : null}
								</button>
							))
						) : (
							<div className="px-4 py-5 text-center text-[13px] text-white/45">
								No matching notes
							</div>
						)}
					</div>
				</div>
			) : null}
			{isDeleteConfirmOpen ? (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
					<div
						role="alertdialog"
						aria-modal="true"
						aria-label="Delete note"
						className="w-full max-w-[320px] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/90 shadow shadow-black backdrop-blur-2xl"
					>
						<div className="px-5 pt-4 pb-3">
							<div className="text-[14px] font-semibold text-white">
								Delete note?
							</div>
							<div className="mt-1 truncate text-[12px] text-white/55">
								{activeNote?.title ?? "This note"} will be permanently deleted.
							</div>
						</div>
						<div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
							<button
								type="button"
								onClick={() => setIsDeleteConfirmOpen(false)}
								className="rounded-md px-3 py-1.5 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
							>
								Cancel
							</button>
							<button
								type="button"
								autoFocus
								onClick={() => {
									setIsDeleteConfirmOpen(false);
									void deleteActiveNote();
								}}
								className="rounded-md bg-accent/90 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			) : null}
			{isLoading ? (
				<div className="note-content">Loading notes</div>
			) : activeNote ? (
				<MDWrapper
					key={activeNote.id}
					noteId={activeNote.id}
					initialMarkdown={activeNote.markdown}
					onMarkdownChange={handleMarkdownChange}
				/>
			) : (
				<div className="note-content">No note loaded</div>
			)}
			<div
				className={cn(
					"absolute bottom-4 right-1/2 translate-x-1/2 px-2 py-1 border border-accent/35 rounded-full flex items-center gap-1 justify-center transition-all duration-300",
					showNoteIndicator ? "opacity-100" : "opacity-0",
				)}
			>
				{notes.map((note) => (
					<div
						key={note.id}
						className={cn(
							"w-2 h-2 rounded-full transition-colors cursor-pointer",
							note.id === activeNote?.id ? "bg-accent" : "bg-accent/50",
						)}
					/>
				))}
			</div>
		</div>
	);
};

export default FloatingNoteEditor;
