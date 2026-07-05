import {
	AlertTriangleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SettingsIcon,
	ShareIcon,
	StarIcon,
	TrashIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	applyAccent,
	type BackdropMode,
	closeNotepad,
	getSettings,
	hexToRgbChannels,
	revealNotesDirectory,
	setAccentColor,
	setHideOnScreenShare,
	setPasteWithFormatting,
	setStrikeCompletedTasks,
} from "../theme";
import { IconButton } from "./Button";
import {
	EDITOR_ZOOM_DEFAULT,
	loadEditorZoom,
	saveEditorZoom,
	stepEditorZoom,
} from "./lib/editorZoom";
import { DragRegion, HStack, Substack } from "./lib/helperdivs";
import { setPasteWithFormatting as setPasteFormattingBridge } from "./lib/pasteSettings";
import { setShortcutOverrides, shortcutMatches } from "./lib/shortcuts";
import { ShortcutSettings } from "./ShortcutSettings";
import { cn, messageFromError } from "./lib/utils";
import {
	clearEditorSearchBridge,
	stepEditorSearchMatch,
	subscribeEditorSearch,
	updateEditorSearch,
} from "./markdown/editorBridge";
import MDWrapper from "./markdown/wrapper";
import { shareNote } from "./notes";
import { useErrors } from "./providers/useErrors";
import { useFocus } from "./providers/useFocus";
import { useNotes } from "./providers/useNotes";
import "./styling/main.css";
import TableOfContents from "./TableOfContents";

const FloatingNoteEditor = () => {
	const { setError, error, cleanError } = useErrors();
	const isFocused = useFocus();
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [notesDirectory, setNotesDirectory] = useState("");
	const [accent, setAccent] = useState("#ff6363");
	const [, setBackdropModeState] = useState<BackdropMode>("glass");
	const [pasteWithFormatting, setPasteWithFormattingState] = useState(true);
	const [hideOnScreenShare, setHideOnScreenShareState] = useState(false);
	const [strikeCompletedTasks, setStrikeCompletedTasksState] = useState(true);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const findInputRef = useRef<HTMLInputElement>(null);
	const [editorZoom, setEditorZoom] = useState(loadEditorZoom);
	const [isFindOpen, setIsFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState("");
	const [findMatchCount, setFindMatchCount] = useState(0);
	const [findActiveIndex, setFindActiveIndex] = useState(0);
	const accentSaveTimerRef = useRef<number | null>(null);
	const shareButtonRef = useRef<HTMLButtonElement>(null);
	const [shouldShowNoteIndicator, setShouldShowNoteIndicator] = useState(false);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [showError, setShowError] = useState(false);
	const showNoteIndicatorTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	// While the settings panel records a new shortcut, all app-level key handling must pause so
	// the combo being recorded doesn't also trigger its current action.
	const isRecordingShortcutRef = useRef(false);

	const handleShortcutRecordingChange = useCallback((recording: boolean) => {
		isRecordingShortcutRef.current = recording;
	}, []);

	const {
		notes,
		activeNote,
		isLoading,
		cycleNote,
		createNewNote,
		deleteNoteById,
		importMarkdownFiles,
		loadNote,
		savePendingNow,
		handleMarkdownChange,
		updateNoteMetadata,
		loadPreviouslyVisitedNote,
	} = useNotes();

	const closeFind = useCallback(() => {
		setIsFindOpen(false);
		setFindQuery("");
		setFindMatchCount(0);
		setFindActiveIndex(0);
		clearEditorSearchBridge();
	}, []);

	function showNoteIndicator() {
		setShouldShowNoteIndicator(true);
		if (showNoteIndicatorTimeoutRef.current) {
			clearTimeout(showNoteIndicatorTimeoutRef.current);
		}
		showNoteIndicatorTimeoutRef.current = setTimeout(() => {
			setShouldShowNoteIndicator(false);
		}, 1000);
	}

	const commitAccent = useCallback((value: string) => {
		if (accentSaveTimerRef.current !== null) {
			window.clearTimeout(accentSaveTimerRef.current);
		}

		accentSaveTimerRef.current = window.setTimeout(() => {
			accentSaveTimerRef.current = null;
			setAccentColor(value)
				.then(() => setSettingsError(null))
				.catch((saveError) =>
					setSettingsError(
						`Could not save accent: ${messageFromError(saveError)}`,
					),
				);
		}, 250);
	}, []);

	const onAccentChange = useCallback(
		(value: string) => {
			setAccent(value);
			if (hexToRgbChannels(value)) {
				applyAccent(value);
				commitAccent(value);
			}
		},
		[commitAccent],
	);

	const onPasteWithFormattingChange = useCallback((enabled: boolean) => {
		setPasteWithFormattingState(enabled);
		setPasteFormattingBridge(enabled);
		void setPasteWithFormatting(enabled)
			.then(() => setSettingsError(null))
			.catch((saveError) =>
				setSettingsError(
					`Could not save paste setting: ${messageFromError(saveError)}`,
				),
			);
	}, []);

	const onHideOnScreenShareChange = useCallback((enabled: boolean) => {
		setHideOnScreenShareState(enabled);
		void setHideOnScreenShare(enabled)
			.then(() => setSettingsError(null))
			.catch((saveError) =>
				setSettingsError(
					`Could not save screen share setting: ${messageFromError(saveError)}`,
				),
			);
	}, []);

	const onStrikeCompletedTasksChange = useCallback((enabled: boolean) => {
		setStrikeCompletedTasksState(enabled);
		void setStrikeCompletedTasks(enabled)
			.then(() => setSettingsError(null))
			.catch((saveError) =>
				setSettingsError(
					`Could not save completed tasks setting: ${messageFromError(saveError)}`,
				),
			);
	}, []);

	const openInNoteSettings = useCallback(() => {
		setIsSearchOpen(false);
		setDeleteTarget(null);
		setIsSettingsOpen(true);
		setSettingsError(null);
		void getSettings()
			.then((settings) => {
				setNotesDirectory(settings.notesDirectory);
				setAccent(settings.accentColor);
				setBackdropModeState(settings.backdropMode);
				setPasteWithFormattingState(settings.pasteWithFormatting);
				setPasteFormattingBridge(settings.pasteWithFormatting);
				setHideOnScreenShareState(settings.hideOnScreenShare);
				setStrikeCompletedTasksState(settings.strikeCompletedTasks);
				setShortcutOverrides(settings.shortcuts);
			})
			.catch((loadError) =>
				setSettingsError(
					`Could not load settings: ${messageFromError(loadError)}`,
				),
			);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// The shortcut recorder owns the keyboard while capturing a new combo.
			if (isRecordingShortcutRef.current) {
				return;
			}

			const isMod = event.metaKey || event.ctrlKey;

			if (isMod && !event.altKey) {
				if (event.key === "=" || event.key === "+") {
					event.preventDefault();
					event.stopPropagation();
					setEditorZoom((current) => stepEditorZoom(current, 1));
					return;
				}

				if (event.key === "-" || event.key === "_") {
					event.preventDefault();
					event.stopPropagation();
					setEditorZoom((current) => stepEditorZoom(current, -1));
					return;
				}

				if (event.key === "0") {
					event.preventDefault();
					event.stopPropagation();
					saveEditorZoom(EDITOR_ZOOM_DEFAULT);
					setEditorZoom(EDITOR_ZOOM_DEFAULT);
					return;
				}
			}

			if (shortcutMatches("findInNote", event)) {
				event.preventDefault();
				event.stopPropagation();
				setIsSearchOpen(false);
				setIsFindOpen(true);
				return;
			}

			if (shortcutMatches("deleteNote", event)) {
				event.preventDefault();
				event.stopPropagation();
				if (activeNote) {
					setIsSearchOpen(false);
					setDeleteTarget({ id: activeNote.id, title: activeNote.title });
				}
				return;
			}

			if (shortcutMatches("openSettings", event)) {
				event.preventDefault();
				event.stopPropagation();
				openInNoteSettings();
				return;
			}

			if (shortcutMatches("newNote", event)) {
				event.preventDefault();
				event.stopPropagation();
				void createNewNote();
				setIsSearchOpen(false);
				setSearchQuery("");
				showNoteIndicator();
				return;
			}

			if (shortcutMatches("searchPanel", event)) {
				event.preventDefault();
				event.stopPropagation();
				setSearchQuery("");
				setHighlightedIndex(0);
				setIsSearchOpen((prev) => !prev);
				return;
			}

			if (
				event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				event.key.toLowerCase() === "tab"
			) {
				event.preventDefault();
				event.stopPropagation();
				void loadPreviouslyVisitedNote();
				return;
			}

			if (isMod && !event.shiftKey && event.altKey) {
				if (event.key === "ArrowLeft") {
					event.preventDefault();
					event.stopPropagation();
					cycleNote(-1);
					showNoteIndicator();
					return;
				}

				if (event.key === "ArrowRight") {
					event.preventDefault();
					event.stopPropagation();
					cycleNote(1);
					showNoteIndicator();
					return;
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [activeNote, createNewNote, cycleNote, loadPreviouslyVisitedNote, openInNoteSettings]);

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
		if (!isFindOpen) {
			return;
		}

		window.requestAnimationFrame(() => {
			findInputRef.current?.focus();
			findInputRef.current?.select();
		});
	}, [isFindOpen]);

	useEffect(() => {
		return subscribeEditorSearch((state) => {
			setFindMatchCount(state.matches.length);
			setFindActiveIndex(
				state.matches.length === 0 ? 0 : state.activeIndex + 1,
			);
		});
	}, []);

	useEffect(() => {
		if (!isFindOpen) {
			return;
		}
		updateEditorSearch(findQuery);
	}, [findQuery, isFindOpen]);

	useEffect(() => {
		closeFind();
	}, [activeNote?.id, closeFind]);

	useEffect(() => {
		if (!deleteTarget) {
			return;
		}

		const handleConfirmKeys = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setDeleteTarget(null);
				return;
			}

			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				setDeleteTarget(null);

				void deleteNoteById(deleteTarget.id);
			}
		};

		window.addEventListener("keydown", handleConfirmKeys, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleConfirmKeys, {
				capture: true,
			});
		};
	}, [deleteTarget, deleteNoteById]);

	useEffect(() => {
		if (!isSettingsOpen) {
			return;
		}

		const handleSettingsKeys = (event: KeyboardEvent) => {
			// While recording a shortcut, Escape belongs to the recorder (cancel), not the modal.
			if (isRecordingShortcutRef.current) {
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setIsSettingsOpen(false);
			}
		};

		window.addEventListener("keydown", handleSettingsKeys, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleSettingsKeys, {
				capture: true,
			});
		};
	}, [isSettingsOpen]);

	useEffect(() => {
		let active = true;
		void getSettings()
			.then((settings) => {
				if (!active) {
					return;
				}
				setPasteWithFormattingState(settings.pasteWithFormatting);
				setPasteFormattingBridge(settings.pasteWithFormatting);
				setStrikeCompletedTasksState(settings.strikeCompletedTasks);
				setShortcutOverrides(settings.shortcuts);
			})
			.catch(() => {
				// Fall back to defaults already in state/bridge.
			});

		return () => {
			active = false;
			if (accentSaveTimerRef.current !== null) {
				window.clearTimeout(accentSaveTimerRef.current);
			}
		};
	}, []);

	const filteredNotes = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const source = query
			? notes.filter((note) => note.title.toLowerCase().includes(query))
			: notes;

		return source;
	}, [notes, searchQuery]);

	const filteredAndStarPriotitizedNotes = useMemo(() => {
		filteredNotes.sort((a, b) => {
			if (a.isStarred && !b.isStarred) {
				return -1;
			}
			if (!a.isStarred && b.isStarred) {
				return 1;
			}
			return 0;
		});
		return filteredNotes;
	}, [filteredNotes]);

	useEffect(() => {
		setHighlightedIndex(0);
	}, [filteredNotes.length, searchQuery]);

	const handleSearchKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement>,
	) => {
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
				setIsSearchOpen(false);
				setSearchQuery("");
				showNoteIndicator();
			}
		}
	};

	useEffect(() => {
		if (error) {
			setShowError(true);
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
			}
			errorTimeoutRef.current = setTimeout(() => {
				errorTimeoutRef.current = null;
				setShowError(false);
			}, 5000);
		}
	}, [error]);

	const handleFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closeFind();
			return;
		}

		if (event.key === "Enter") {
			event.preventDefault();
			stepEditorSearchMatch(event.shiftKey ? -1 : 1);
		}
	};

	const toggleStarNote = useCallback(
		async (noteId: string | undefined) => {
			if (!noteId) {
				return;
			}

			const note = notes.find((item) => item.id === noteId);
			if (!note) {
				return;
			}

			try {
				await updateNoteMetadata(noteId, { isStarred: !note.isStarred });
			} catch (error) {
				setError(`Could not toggle star: ${messageFromError(error)}`);
			}
		},
		[notes, setError, updateNoteMetadata],
	);

	const handleShareNote = useCallback(
		async (noteId: string, anchor?: { x: number; y: number }) => {
			// Flush any pending edit first so the shared copy has the latest content and title.
			const saved = await savePendingNow();
			if (!saved) {
				return;
			}

			let { x, y } = anchor ?? {};
			if (x === undefined || y === undefined) {
				const button = shareButtonRef.current;
				if (!button) {
					return;
				}
				const rect = button.getBoundingClientRect();
				x = rect.left + rect.width / 2;
				y = rect.top + rect.height / 2;
			}

			try {
				await shareNote(noteId, x, y);
				setError(null);
			} catch (shareError) {
				setError(`Could not share note: ${messageFromError(shareError)}`);
			}
		},
		[savePendingNow, setError],
	);

	const handleShareActiveNote = useCallback(async () => {
		if (!activeNote) {
			return;
		}

		void handleShareNote(activeNote.id);
	}, [activeNote, handleShareNote]);

	return (
		<div
			id="floating-note-editor"
			data-strike-completed={strikeCompletedTasks ? "true" : "false"}
			className={cn(
				"border-4 border-accent/20 transition-colors duration-300",
				isFocused ? "border-accent/60" : "border-accent/5",
			)}
		>
			<DragRegion
				className={cn(
					"note-navbar absolute inset-x-0 top-0 z-20 flex h-10 shrink-0 items-center justify-center border-b border-white/10 backdrop-blur-sm",
					isFocused
						? "focused shadow-xl shadow-black/35"
						: "unfocused shadow-lg shadow-black/10",
				)}
				aria-label="Drag to move note"
			>
				<HStack fillWidth gap={4} x="between" y="middle" className="mx-4">
					<div className="truncate text-left text-[12px] font-medium leading-none text-white/80">
						{activeNote?.title ?? "Notes"}
					</div>
					<div
						aria-hidden="true"
						className="absolute left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/25"
					/>
					<Substack x="left" fillWidth={false} gap={2}>
						<IconButton
							type="button"
							onClick={() => void toggleStarNote(activeNote?.id)}
							icon={
								<StarIcon
									strokeDasharray={activeNote?.isStarred ? "0" : "100"}
									fill={activeNote?.isStarred ? "currentColor" : "none"}
									className={cn(
										"w-4 h-4 text-white/55 transition-colors duration-200",
										activeNote?.isStarred ? "text-accent/80" : "text-white/55",
									)}
								/>
							}
						/>
						<IconButton
							ref={shareButtonRef}
							type="button"
							onClick={() => void handleShareActiveNote()}
							aria-label="Share note"
							title="Share note"
							icon={<ShareIcon className="w-4 h-4" />}
						/>
						<IconButton
							type="button"
							onClick={openInNoteSettings}
							aria-label="Open settings"
							title="Settings (⌘,)"
							icon={<SettingsIcon className="w-4 h-4" />}
						/>
						<IconButton
							type="button"
							onClick={closeNotepad}
							aria-label="Close notepad"
							title="Close notepad"
							icon={<XIcon className="w-4 h-4" />}
						/>
					</Substack>
				</HStack>
			</DragRegion>
			<HStack
				className={cn(
					"absolute inset-x-4 top-14 z-30 rounded-md border-2 border-error/85 bg-error/15 px-3 py-2 text-[12px] text-error transition-opacity duration-200",
					showError ? "opacity-100" : "opacity-0",
				)}
			>
				<AlertTriangleIcon className="w-4 h-4" />
				<span className="text-error">{cleanError}</span>
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
						{filteredAndStarPriotitizedNotes.length > 0 ? (
							<>
								{filteredAndStarPriotitizedNotes.length > 0
									? filteredAndStarPriotitizedNotes.map((note, index) => {
											return (
												// Not a <button>: the row holds the action buttons, and buttons can't nest.
												<div
													key={note.id}
													role="button"
													tabIndex={-1}
													onMouseEnter={() => setHighlightedIndex(index)}
													onClick={() => {
														void loadNote(note.id);
														showNoteIndicator();
														setIsSearchOpen(false);
													}}
													className={cn(
														"text-white/72 flex h-10 w-full cursor-pointer items-center gap-3 px-4 text-left text-[13px] transition-colors hover:bg-accent/18 hover:text-white",
														index === highlightedIndex &&
															"bg-accent/18 text-white",
													)}
												>
													{activeNote?.id === note.id && (
														<div className="w-[2px] h-3.5 shrink-0 bg-accent rounded-full" />
													)}
													<span className="min-w-0 flex-1 truncate">
														{note.title}
													</span>
													{index === highlightedIndex ? (
														<>
															<IconButton
																type="button"
																onClick={(event) => {
																	event.stopPropagation();
																	void toggleStarNote(note.id);
																}}
																aria-label={
																	note.isStarred ? "Unstar note" : "Star note"
																}
																title={
																	note.isStarred ? "Unstar note" : "Star note"
																}
																icon={
																	<StarIcon
																		fill={
																			note.isStarred ? "currentColor" : "none"
																		}
																		className={cn(
																			"w-4 h-4",
																			note.isStarred && "text-accent/80",
																		)}
																	/>
																}
															/>
															<IconButton
																type="button"
																onClick={(event) => {
																	event.stopPropagation();
																	const rect =
																		event.currentTarget.getBoundingClientRect();
																	void handleShareNote(note.id, {
																		x: rect.left + rect.width / 2,
																		y: rect.top + rect.height / 2,
																	});
																}}
																aria-label="Share note"
																title="Share note"
																icon={<ShareIcon className="w-4 h-4" />}
															/>
															<IconButton
																type="button"
																onClick={(event) => {
																	event.stopPropagation();
																	setDeleteTarget({
																		id: note.id,
																		title: note.title,
																	});
																}}
																aria-label="Delete note"
																title="Delete note"
																icon={<TrashIcon className="w-4 h-4" />}
															/>
														</>
													) : (
														note.isStarred && (
															<StarIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
														)
													)}
												</div>
											);
										})
									: null}
							</>
						) : (
							<div className="px-4 py-5 text-center text-[13px] text-white/45">
								No matching notes
							</div>
						)}
					</div>
				</div>
			) : null}

			{isFindOpen ? (
				<div className="absolute inset-x-4 top-14 z-40 flex h-11 items-center gap-2 overflow-hidden rounded-lg border border-white/15 bg-neutral-950/10 px-3 backdrop-blur-2xl">
					<input
						ref={findInputRef}
						value={findQuery}
						onChange={(event) => setFindQuery(event.target.value)}
						onKeyDown={handleFindKeyDown}
						className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
						placeholder="Find in note"
						spellCheck={false}
					/>
					<span className="shrink-0 text-[12px] tabular-nums text-white/45">
						{findMatchCount === 0
							? findQuery.trim()
								? "No matches"
								: ""
							: `${findActiveIndex} of ${findMatchCount}`}
					</span>
					<IconButton
						type="button"
						aria-label="Previous match"
						title="Previous match (Shift+Enter)"
						onClick={() => stepEditorSearchMatch(-1)}
						icon={<ChevronUpIcon className="h-4 w-4" />}
					/>
					<IconButton
						type="button"
						aria-label="Next match"
						title="Next match (Enter)"
						onClick={() => stepEditorSearchMatch(1)}
						icon={<ChevronDownIcon className="h-4 w-4" />}
					/>
				</div>
			) : null}
			{deleteTarget ? (
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
								{deleteTarget.title || "This note"} will be permanently
								deleted.
							</div>
						</div>
						<div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
							<button
								type="button"
								onClick={() => setDeleteTarget(null)}
								className="rounded-md px-3 py-1.5 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
							>
								Cancel
							</button>
							<button
								type="button"
								autoFocus
								onClick={() => {
									setDeleteTarget(null);
									void deleteNoteById(deleteTarget.id);
								}}
								className="rounded-md bg-accent/90 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			) : null}
			{isSettingsOpen ? (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
					<div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/10 shadow-lg shadow-black/20 backdrop-blur-2xl">
						<div className="flex items-start justify-between border-b border-white/10 px-5 pt-4 pb-3">
							<div>
								<div className="text-[15px] font-semibold text-white">
									Settings
								</div>
								<div className="mt-0.5 text-[12px] text-white/45">
									Preferences for this notepad view.
								</div>
							</div>
							<button
								type="button"
								onClick={() => setIsSettingsOpen(false)}
								className="rounded-md px-2 py-1 text-[12px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
							>
								Close
							</button>
						</div>
						<div className="max-h-[70vh] overflow-y-auto px-5 py-4">
							{settingsError ? (
								<div className="mb-4 rounded-md border border-accent/35 bg-accent/12 px-3 py-2 text-[12px] text-white/80">
									{settingsError}
								</div>
							) : null}
							<div className="flex flex-col gap-5">
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Notes folder
									</span>
									<div className="flex items-center gap-2">
										<code className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-white/4 px-3 py-2 text-[12px] text-white/60">
											{notesDirectory || "Loading..."}
										</code>
										<button
											type="button"
											onClick={() =>
												void revealNotesDirectory().catch((e) =>
													setSettingsError(
														`Could not open folder: ${messageFromError(e)}`,
													),
												)
											}
											className="shrink-0 rounded-md border border-white/15 bg-white/6 px-3 py-2 text-[12px] text-white/80 transition-colors hover:bg-white/12 hover:text-white"
										>
											Reveal
										</button>
									</div>
								</section>
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Import
									</span>
									<button
										type="button"
										onClick={() => void importMarkdownFiles()}
										className="w-fit rounded-md border border-white/15 bg-white/6 px-3 py-2 text-[12px] text-white/80 transition-colors hover:bg-white/12 hover:text-white"
									>
										Import markdown files
									</button>
									<p className="text-[12px] text-white/35">
										Copy .md, .markdown, or .txt files into your notes folder.
									</p>
								</section>
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Paste
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											aria-pressed={pasteWithFormatting}
											onClick={() => onPasteWithFormattingChange(true)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												pasteWithFormatting
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											Formatted
										</button>
										<button
											type="button"
											aria-pressed={!pasteWithFormatting}
											onClick={() => onPasteWithFormattingChange(false)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												!pasteWithFormatting
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											Plain text
										</button>
									</div>
									<p className="text-[12px] text-white/35">
										⌘⇧V pastes using the other mode
									</p>
								</section>
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Screen sharing
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											aria-pressed={!hideOnScreenShare}
											onClick={() => onHideOnScreenShareChange(false)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												!hideOnScreenShare
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											Visible
										</button>
										<button
											type="button"
											aria-pressed={hideOnScreenShare}
											onClick={() => onHideOnScreenShareChange(true)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												hideOnScreenShare
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											Hidden
										</button>
									</div>
									<p className="text-[12px] text-white/35">
										Hidden keeps the notepad out of screen shares and
										recordings.
									</p>
								</section>
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Completed tasks
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											aria-pressed={strikeCompletedTasks}
											onClick={() => onStrikeCompletedTasksChange(true)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												strikeCompletedTasks
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											<span className="text-white/50 line-through">
												Strike through
											</span>
										</button>
										<button
											type="button"
											aria-pressed={!strikeCompletedTasks}
											onClick={() => onStrikeCompletedTasksChange(false)}
											className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${
												!strikeCompletedTasks
													? "border-accent/50 bg-accent/16 text-white"
													: "border-white/15 bg-white/6 text-white/80 hover:bg-white/12 hover:text-white"
											}`}
										>
											Plain
										</button>
									</div>
									<p className="text-[12px] text-white/35">
										Strike through grays out checked to-do items.
									</p>
								</section>
								<ShortcutSettings
									onError={setSettingsError}
									onRecordingChange={handleShortcutRecordingChange}
								/>
								<section className="flex flex-col gap-2">
									<span className="text-[13px] font-medium text-white/80">
										Accent color
									</span>
									<div className="flex items-center gap-3">
										<input
											type="color"
											value={accent}
											onChange={(event) => onAccentChange(event.target.value)}
											aria-label="Accent color"
											className="h-9 w-12 cursor-pointer rounded-md border border-white/15 bg-transparent "
										/>
										<input
											type="text"
											value={accent}
											spellCheck={false}
											onChange={(event) => onAccentChange(event.target.value)}
											aria-label="Accent color hex"
											className="rounded-md border border-white/15 bg-white/4 px-3 py-2 text-[13px] uppercase text-white outline-none focus:border-accent/60"
										/>
									</div>
								</section>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{isLoading ? (
				<div className="note-content">Loading notes</div>
			) : activeNote ? (
				<>
					<MDWrapper
						key={activeNote.id}
						noteId={activeNote.id}
						initialMarkdown={activeNote.markdown}
						onMarkdownChange={handleMarkdownChange}
						zoom={editorZoom}
					/>
					<TableOfContents noteId={activeNote.id} />
				</>
			) : (
				<div className="note-content">No note loaded</div>
			)}
			<div
				className={cn(
					"absolute bottom-4 right-1/2 translate-x-1/2 px-2 py-1 rounded-full flex items-center gap-1 justify-center transition-all duration-300 backdrop-blur-lg bg-accent/5",
					shouldShowNoteIndicator ? "opacity-100" : "opacity-0",
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
