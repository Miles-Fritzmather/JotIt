import {
	AlertTriangleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SettingsIcon,
	ShareIcon,
	StarIcon,
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
	setPasteWithFormatting,
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

const FloatingNoteEditor = () => {
	const { setError, error, cleanError } = useErrors();
	const isFocused = useFocus();
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [notesDirectory, setNotesDirectory] = useState("");
	const [accent, setAccent] = useState("#ff6363");
	const [, setBackdropModeState] = useState<BackdropMode>("glass");
	const [pasteWithFormatting, setPasteWithFormattingState] = useState(true);
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

	const {
		notes,
		activeNote,
		isLoading,
		cycleNote,
		createNewNote,
		deleteActiveNote,
		importMarkdownFiles,
		loadNote,
		savePendingNow,
		handleMarkdownChange,
		updateNoteMetadata,
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

	const openInNoteSettings = useCallback(() => {
		setIsSearchOpen(false);
		setIsDeleteConfirmOpen(false);
		setIsSettingsOpen(true);
		setSettingsError(null);
		void getSettings()
			.then((settings) => {
				setNotesDirectory(settings.notesDirectory);
				setAccent(settings.accentColor);
				setBackdropModeState(settings.backdropMode);
				setPasteWithFormattingState(settings.pasteWithFormatting);
				setPasteFormattingBridge(settings.pasteWithFormatting);
			})
			.catch((loadError) =>
				setSettingsError(
					`Could not load settings: ${messageFromError(loadError)}`,
				),
			);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
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

				if (!event.shiftKey && event.key.toLowerCase() === "f") {
					event.preventDefault();
					event.stopPropagation();
					setIsSearchOpen(false);
					setIsFindOpen(true);
					return;
				}
			}

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
				if (activeNote) {
					setIsSearchOpen(false);
					setIsDeleteConfirmOpen(true);
				}
				return;
			}

			if (!event.altKey && event.key === ",") {
				event.preventDefault();
				event.stopPropagation();
				openInNoteSettings();
				return;
			}

			if (!event.altKey && event.key.toLowerCase() === "n") {
				event.preventDefault();
				event.stopPropagation();
				void createNewNote();
				setIsSearchOpen(false);
				setSearchQuery("");
				showNoteIndicator();
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
				showNoteIndicator();
				return;
			}

			if (event.altKey && event.key === "ArrowRight") {
				event.preventDefault();
				event.stopPropagation();
				cycleNote(1);
				showNoteIndicator();
				return;
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [createNewNote, cycleNote, openInNoteSettings]);

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

	useEffect(() => {
		if (!isSettingsOpen) {
			return;
		}

		const handleSettingsKeys = (event: KeyboardEvent) => {
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

	const starredFilteredNotes = useMemo(
		() => filteredNotes.filter((note) => note.isStarred),
		[filteredNotes],
	);
	const unstarredFilteredNotes = useMemo(
		() => filteredNotes.filter((note) => !note.isStarred),
		[filteredNotes],
	);

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

	const handleShareNote = useCallback(async () => {
		if (!activeNote) {
			return;
		}

		const saved = await savePendingNow();
		if (!saved) {
			return;
		}

		const button = shareButtonRef.current;
		if (!button) {
			return;
		}

		const rect = button.getBoundingClientRect();
		const anchorX = rect.left + rect.width / 2;
		const anchorY = rect.top + rect.height / 2;

		try {
			await shareNote(activeNote.id, anchorX, anchorY);
			setError(null);
		} catch (shareError) {
			setError(`Could not share note: ${messageFromError(shareError)}`);
		}
	}, [activeNote, savePendingNow, setError]);

	return (
		<div
			id="floating-note-editor"
			className={cn(
				"border-4 border-accent/20 transition-colors duration-300",
				isFocused ? "border-accent/30" : "border-accent/5",
			)}
		>
			<DragRegion
				className={cn(
					"note-navbar absolute inset-x-0 top-0 z-20 flex h-10 shrink-0 items-center justify-center border-b border-white/10 backdrop-blur-sm shadow-lg shadow-black/10",
					isFocused ? "focused" : "unfocused",
				)}
				aria-label="Drag to move note"
			>
				<HStack fillWidth gap={4} x="between" y="middle" className="mx-4">
					<div className="truncate text-left text-[12px] font-medium leading-none text-white/55">
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
							onClick={() => void handleShareNote()}
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
						{filteredNotes.length > 0 ? (
							<>
								{starredFilteredNotes.length > 0
									? starredFilteredNotes.map((note) => {
											const noteIndex = filteredNotes.findIndex(
												(item) => item.id === note.id,
											);
											return (
												<button
													key={note.id}
													type="button"
													onMouseEnter={() => setHighlightedIndex(noteIndex)}
													onClick={() => {
														void loadNote(note.id);
														showNoteIndicator();
													}}
													className={[
														"flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] transition-colors",
														noteIndex === highlightedIndex
															? "bg-accent/18 text-white"
															: "text-white/72 hover:bg-white/10 hover:text-white",
													].join(" ")}
												>
													<span className="min-w-0 flex-1 truncate">
														{note.title}
													</span>
													<StarIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
												</button>
											);
										})
									: null}

								{unstarredFilteredNotes.length > 0
									? unstarredFilteredNotes.map((note) => {
											const noteIndex = filteredNotes.findIndex(
												(item) => item.id === note.id,
											);
											return (
												<button
													key={note.id}
													type="button"
													onMouseEnter={() => setHighlightedIndex(noteIndex)}
													onClick={() => {
														void loadNote(note.id);
														showNoteIndicator();
													}}
													className={[
														"flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] transition-colors",
														noteIndex === highlightedIndex
															? "bg-accent/18 text-white"
															: "text-white/72 hover:bg-white/10 hover:text-white",
													].join(" ")}
												>
													<span className="min-w-0 flex-1 truncate">
														{note.title}
													</span>
													{note.id === activeNote?.id ? (
														<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
													) : null}
												</button>
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
				<MDWrapper
					key={activeNote.id}
					noteId={activeNote.id}
					initialMarkdown={activeNote.markdown}
					onMarkdownChange={handleMarkdownChange}
					zoom={editorZoom}
				/>
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
