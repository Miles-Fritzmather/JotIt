import MDWrapper from "./markdown/wrapper";

export function blurNotepad() {
	const element = document.getElementById("floating-note-editor");
	if (element) {
		element.blur();
		return;
	}
}

const FloatingNoteEditor = () => {
	// useEffect(() => {
	// 	focusAutofocusElement();
	// 	const retryFocus = window.setTimeout(focusAutofocusElement, 50);
	// 	let disposed = false;
	// 	let unlisten: (() => void) | undefined;

	// 	void listen(FOCUS_FLOATING_NOTE_EDITOR_EVENT, focusAutofocusElement)
	// 		.then((cleanup) => {
	// 			if (disposed) {
	// 				cleanup();
	// 				return;
	// 			}

	// 			unlisten = cleanup;
	// 		})
	// 		.catch((error) => {
	// 			console.error("Failed to listen for floating note focus events", error);
	// 		});

	// 	return () => {
	// 		disposed = true;
	// 		window.clearTimeout(retryFocus);
	// 		unlisten?.();
	// 	};
	// }, []);

	return (
		<div id="floating-note-editor">
			<MDWrapper />
		</div>
	);
};

export default FloatingNoteEditor;
