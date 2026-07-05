import { RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { setShortcut } from "../theme";
import {
	bindingFromEvent,
	displayShortcut,
	getShortcutBinding,
	isShortcutOverridden,
	SHORTCUT_DEFINITIONS,
	setShortcutOverride,
	type ShortcutActionId,
	type ShortcutDefinition,
	subscribeShortcuts,
} from "./lib/shortcuts";

interface ShortcutSettingsProps {
	onError: (message: string | null) => void;
	/** Reported so the host can suspend its own global key handlers while recording. */
	onRecordingChange?: (recording: boolean) => void;
}

function bindingsSnapshot() {
	return SHORTCUT_DEFINITIONS.map(
		(definition) => `${definition.id}:${getShortcutBinding(definition.id)}`,
	).join("|");
}

/**
 * The "Shortcuts" settings section: one row per action showing the current binding. Click a
 * binding to record a new one (press the combo; Escape cancels); the reset arrow appears on
 * rows that differ from the default.
 */
export function ShortcutSettings({
	onError,
	onRecordingChange,
}: ShortcutSettingsProps) {
	const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);

	// Re-render whenever any binding changes, without copying the store into state.
	useSyncExternalStore(subscribeShortcuts, bindingsSnapshot);

	const stopRecording = useCallback(() => {
		setRecordingId(null);
		onRecordingChange?.(false);
	}, [onRecordingChange]);

	const startRecording = useCallback(
		(id: ShortcutActionId) => {
			setRecordingId(id);
			onRecordingChange?.(true);
			onError(null);
		},
		[onError, onRecordingChange],
	);

	useEffect(() => {
		if (!recordingId) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				stopRecording();
				return;
			}

			const binding = bindingFromEvent(event);
			if (!binding) {
				// Modifier-only press; keep listening for the full combo.
				return;
			}

			// Bare keys would fire while typing notes; insist on a real chord.
			if (!event.metaKey && !event.ctrlKey && !event.altKey) {
				onError("Shortcuts need at least ⌘, ⌃, or ⌥.");
				stopRecording();
				return;
			}

			const conflict = SHORTCUT_DEFINITIONS.find(
				(definition) =>
					definition.id !== recordingId &&
					getShortcutBinding(definition.id) === binding,
			);
			if (conflict) {
				onError(
					`${displayShortcut(binding)} is already used by "${conflict.label}".`,
				);
				stopRecording();
				return;
			}

			const previous = getShortcutBinding(recordingId);
			setShortcutOverride(recordingId, binding);
			stopRecording();

			setShortcut(recordingId, binding)
				.then(() => onError(null))
				.catch((saveError) => {
					// The backend rejected it (e.g. the OS can't register the global shortcut);
					// roll the override back so the UI matches what is actually active.
					setShortcutOverride(
						recordingId,
						isShortcutOverridden(recordingId) ? previous : null,
					);
					onError(
						saveError instanceof Error ? saveError.message : String(saveError),
					);
				});
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [recordingId, onError, stopRecording]);

	const resetShortcut = useCallback(
		(id: ShortcutActionId) => {
			setShortcutOverride(id, null);
			void setShortcut(id, null)
				.then(() => onError(null))
				.catch((saveError) =>
					onError(
						saveError instanceof Error ? saveError.message : String(saveError),
					),
				);
		},
		[onError],
	);

	const renderRow = (definition: ShortcutDefinition) => {
		const isRecording = recordingId === definition.id;
		const binding = getShortcutBinding(definition.id);
		return (
			<div key={definition.id} className="flex h-9 items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-[12px] text-white/70">
					{definition.label}
				</span>
				{isShortcutOverridden(definition.id) && !isRecording ? (
					<button
						type="button"
						onClick={() => resetShortcut(definition.id)}
						aria-label={`Reset ${definition.label} shortcut`}
						title="Reset to default"
						className="flex h-6 w-6 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
					>
						<RotateCcwIcon className="h-3 w-3" />
					</button>
				) : null}
				<button
					type="button"
					onClick={() =>
						isRecording ? stopRecording() : startRecording(definition.id)
					}
					className={`min-w-[88px] rounded-md border px-2.5 py-1.5 text-center text-[12px] tabular-nums transition-colors ${
						isRecording
							? "border-accent/60 bg-accent/16 text-accent"
							: "border-white/15 bg-white/6 text-white/85 hover:bg-white/12"
					}`}
				>
					{isRecording ? "Press keys…" : displayShortcut(binding)}
				</button>
			</div>
		);
	};

	const generalDefinitions = SHORTCUT_DEFINITIONS.filter(
		(definition) => definition.group === "General",
	);
	const formattingDefinitions = SHORTCUT_DEFINITIONS.filter(
		(definition) => definition.group === "Formatting",
	);

	return (
		<section className="flex flex-col gap-2">
			<span className="text-[13px] font-medium text-white/80">Shortcuts</span>
			<div className="flex flex-col divide-y divide-white/6 rounded-md border border-white/10 bg-white/4 px-3">
				<div className="py-1.5">
					<div className="pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-white/35">
						General
					</div>
					{generalDefinitions.map(renderRow)}
				</div>
				<div className="py-1.5">
					<div className="pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-white/35">
						Formatting
					</div>
					{formattingDefinitions.map(renderRow)}
				</div>
			</div>
			<p className="text-[12px] text-white/35">
				Click a shortcut, then press the new keys. Esc cancels.
			</p>
		</section>
	);
}
