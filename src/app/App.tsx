import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyAccent,
	getSettings,
	hexToRgbChannels,
	revealNotesDirectory,
	setAccentColor,
} from "../theme";
import "./App.css";

function messageFromError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function App() {
	const [notesDirectory, setNotesDirectory] = useState("");
	const [accent, setAccent] = useState("#ff6363");
	const [error, setError] = useState<string | null>(null);
	const saveTimerRef = useRef<number | null>(null);

	useEffect(() => {
		let active = true;
		getSettings()
			.then((settings) => {
				if (!active) {
					return;
				}
				setNotesDirectory(settings.notesDirectory);
				setAccent(settings.accentColor);
			})
			.catch((loadError) => {
				if (active) {
					setError(`Could not load settings: ${messageFromError(loadError)}`);
				}
			});

		return () => {
			active = false;
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
			}
		};
	}, []);

	// Persist on a short debounce so dragging the color picker doesn't hammer the disk, while the
	// preview updates instantly via applyAccent (the persisted write also drives the live
	// cross-window event so the notepad recolors too).
	const commitAccent = useCallback((value: string) => {
		if (saveTimerRef.current !== null) {
			window.clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = window.setTimeout(() => {
			saveTimerRef.current = null;
			setAccentColor(value)
				.then(() => setError(null))
				.catch((saveError) =>
					setError(`Could not save accent: ${messageFromError(saveError)}`),
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

	return (
		<main className="flex min-h-screen w-screen flex-col gap-6 bg-neutral-950 px-7 py-6 font-sans text-white antialiased">
			<header>
				<h1 className="text-[18px] font-semibold tracking-tight">Settings</h1>
				<p className="mt-0.5 text-[13px] text-white/45">
					Preferences for the notepad.
				</p>
			</header>

			{error ? (
				<div className="rounded-md border border-accent/35 bg-accent/12 px-3 py-2 text-[12px] text-white/80">
					{error}
				</div>
			) : null}

			<section className="flex flex-col gap-2">
				<span className="text-[13px] font-medium text-white/80">
					Notes folder
				</span>
				<div className="flex items-center gap-2">
					<code className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-white/4 px-3 py-2 text-[12px] text-white/60">
						{notesDirectory || "Loading…"}
					</code>
					<button
						type="button"
						onClick={() =>
							void revealNotesDirectory().catch((revealError) =>
								setError(
									`Could not open folder: ${messageFromError(revealError)}`,
								),
							)
						}
						className="shrink-0 rounded-md border border-white/15 bg-white/6 px-3 py-2 text-[12px] text-white/80 transition-colors hover:bg-white/12 hover:text-white"
					>
						Reveal
					</button>
				</div>
				<p className="text-[12px] text-white/35">
					Every note is saved here as a Markdown file.
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
						className="h-9 w-12 cursor-pointer rounded-md border border-white/15 bg-transparent"
					/>
					<input
						type="text"
						value={accent}
						spellCheck={false}
						onChange={(event) => onAccentChange(event.target.value)}
						aria-label="Accent color hex"
						className="w-28 rounded-md border border-white/15 bg-white/4 px-3 py-2 text-[13px] uppercase text-white outline-none focus:border-accent/6"
					/>
					<span
						aria-hidden="true"
						className="ml-auto inline-flex items-center gap-2 rounded-md bg-accent/16 px-3 py-2 text-[12px] font-medium text-accent"
					>
						<span className="h-2.5 w-2.5 rounded-full bg-accent" />
						Preview
					</span>
				</div>
				<p className="text-[12px] text-white/35">
					Applied across the app instantly.
				</p>
			</section>
		</main>
	);
}

export default App;
