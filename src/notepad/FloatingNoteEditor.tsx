import MDWrapper from "./markdown/wrapper";

export function blurNotepad() {
	const element = document.getElementById("floating-note-editor");
	if (element) {
		element.blur();
		return;
	}
}

const floatingNoteClassName = [
	"relative h-screen w-screen overflow-hidden bg-black/50 font-sans text-[13px] leading-[1.45] text-white/95 antialiased backdrop-blur-2xl backdrop-saturate-150 selection:bg-sky-300/35 selection:text-white",
	"[&_.markdown-wrapper]:relative [&_.markdown-wrapper]:z-10 [&_.markdown-wrapper]:h-full [&_.markdown-wrapper]:w-full",
	"[&_.milkdown]:h-full [&_.milkdown]:w-full [&_.milkdown]:bg-transparent",
	"[&_.milkdown]:[--crepe-color-background:transparent] [&_.milkdown]:[--crepe-color-error:rgb(255_140_157)] [&_.milkdown]:[--crepe-color-hover:rgb(255_255_255_/_0.13)] [&_.milkdown]:[--crepe-color-inline-area:rgb(255_255_255_/_0.12)] [&_.milkdown]:[--crepe-color-inline-code:rgb(255_209_220)]",
	"[&_.milkdown]:[--crepe-color-inverse:rgb(255_255_255_/_0.9)] [&_.milkdown]:[--crepe-color-on-background:rgb(255_255_255_/_0.94)] [&_.milkdown]:[--crepe-color-on-inverse:rgb(18_20_24_/_0.94)] [&_.milkdown]:[--crepe-color-on-secondary:rgb(255_255_255_/_0.92)]",
	"[&_.milkdown]:[--crepe-color-on-surface:rgb(255_255_255_/_0.92)] [&_.milkdown]:[--crepe-color-on-surface-variant:rgb(255_255_255_/_0.66)] [&_.milkdown]:[--crepe-color-outline:rgb(255_255_255_/_0.32)] [&_.milkdown]:[--crepe-color-primary:rgb(255_255_255_/_0.92)]",
	"[&_.milkdown]:[--crepe-color-secondary:rgb(255_255_255_/_0.16)] [&_.milkdown]:[--crepe-color-selected:rgb(116_188_255_/_0.32)] [&_.milkdown]:[--crepe-color-surface-low:rgb(255_255_255_/_0.1)] [&_.milkdown]:[--crepe-color-surface:rgb(20_23_28_/_0.72)]",
	"[&_.milkdown]:[--crepe-font-code:ui-monospace] [&_.milkdown]:[--crepe-font-default:system-ui] [&_.milkdown]:[--crepe-font-title:system-ui] [&_.milkdown]:[--crepe-shadow-1:0_12px_34px_rgb(0_0_0_/_0.28)] [&_.milkdown]:[--crepe-shadow-2:0_18px_44px_rgb(0_0_0_/_0.34)]",
	"[&_.ProseMirror]:min-h-full [&_.ProseMirror]:bg-transparent [&_.ProseMirror]:px-7 [&_.ProseMirror]:pb-7 [&_.ProseMirror]:pt-5 [&_.ProseMirror]:text-[13px] [&_.ProseMirror]:leading-[1.45] [&_.ProseMirror]:text-white/95 [&_.ProseMirror]:caret-white [&_.ProseMirror]:outline-none",
	"[&_.ProseMirror_p]:py-0.5 [&_.ProseMirror_p]:text-[13px] [&_.ProseMirror_p]:leading-[1.45] [&_.ProseMirror_li]:my-0 [&_.ProseMirror_li]:text-[13px] [&_.ProseMirror_li]:leading-[1.45]",
	"[&_.ProseMirror_h1]:mt-2 [&_.ProseMirror_h1]:py-px [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:leading-snug [&_.ProseMirror_h1]:text-white",
	"[&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:py-px [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-snug [&_.ProseMirror_h2]:text-white",
	"[&_.ProseMirror_h3]:mt-1.5 [&_.ProseMirror_h3]:py-px [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug [&_.ProseMirror_h3]:text-white",
	"[&_.ProseMirror_h4]:mt-1.5 [&_.ProseMirror_h4]:py-px [&_.ProseMirror_h4]:text-sm [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:leading-snug [&_.ProseMirror_h4]:text-white",
	"[&_.ProseMirror_h5]:mt-1.5 [&_.ProseMirror_h5]:py-px [&_.ProseMirror_h5]:text-sm [&_.ProseMirror_h5]:font-semibold [&_.ProseMirror_h5]:leading-snug [&_.ProseMirror_h5]:text-white",
	"[&_.ProseMirror_h6]:mt-1.5 [&_.ProseMirror_h6]:py-px [&_.ProseMirror_h6]:text-sm [&_.ProseMirror_h6]:font-semibold [&_.ProseMirror_h6]:leading-snug [&_.ProseMirror_h6]:text-white",
	"[&_.ProseMirror_blockquote]:my-1.5 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-white/30 [&_.ProseMirror_blockquote]:py-0.5 [&_.ProseMirror_blockquote]:pl-2.5 [&_.ProseMirror_blockquote]:text-white/70",
	"[&_.ProseMirror_a]:text-sky-200 [&_.ProseMirror_a]:decoration-sky-200/60 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-black/25 [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-black/25",
	"[&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ol]:my-1 [&_.milkdown-list-item-block]:py-0 [&_.milkdown-list-item-block_>_.list-item]:items-start [&_.milkdown-list-item-block_li]:gap-1.5",
	"[&_.milkdown-list-item-block_>_.list-item_>_.children]:min-w-0 [&_.milkdown-list-item-block_>_.list-item_>_.children]:flex-1",
	"[&_.milkdown-list-item-block_li_.label-wrapper]:h-[21px] [&_.milkdown-list-item-block_li_.label-wrapper]:w-4 [&_.milkdown-list-item-block_li_.label-wrapper]:items-start [&_.milkdown-list-item-block_li_.label-wrapper]:justify-end [&_.milkdown-list-item-block_li_.label-wrapper]:pt-[2px]",
	"[&_.milkdown-list-item-block_li_.label-wrapper_.label]:h-[19px] [&_.milkdown-list-item-block_li_.label-wrapper_.label]:w-4 [&_.milkdown-list-item-block_li_.label-wrapper_.label]:p-0 [&_.milkdown-list-item-block_li_.label-wrapper_.label]:text-right [&_.milkdown-list-item-block_li_.label-wrapper_.label]:text-[13px] [&_.milkdown-list-item-block_li_.label-wrapper_.label]:leading-[19px]",
	"[&_.milkdown-code-block]:bg-black/25 [&_.milkdown-code-block_.cm-editor]:bg-black/25 [&_.milkdown-code-block_.cm-gutters]:bg-black/25",
	"[&_.milkdown-link-edit]:border [&_.milkdown-link-edit]:border-white/15 [&_.milkdown-link-edit]:bg-neutral-950/75 [&_.milkdown-link-edit]:backdrop-blur-2xl",
	"[&_.milkdown-link-preview]:border [&_.milkdown-link-preview]:border-white/15 [&_.milkdown-link-preview]:bg-neutral-950/75 [&_.milkdown-link-preview]:backdrop-blur-2xl",
	"[&_.milkdown-slash-menu]:border [&_.milkdown-slash-menu]:border-white/15 [&_.milkdown-slash-menu]:bg-neutral-950/75 [&_.milkdown-slash-menu]:backdrop-blur-2xl",
	"[&_.milkdown-toolbar]:border [&_.milkdown-toolbar]:border-white/15 [&_.milkdown-toolbar]:bg-neutral-950/75 [&_.milkdown-toolbar]:backdrop-blur-2xl",
].join(" ");

const glassSurfaceClassName =
	"pointer-events-none absolute inset-0 z-0 border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.03] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.22),inset_0_-1px_0_rgb(0_0_0_/_0.2)]";

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
		<div
			id="floating-note-editor"
			className="bg-red-400" /* className={floatingNoteClassName} */
		>
			<div aria-hidden="true" /* className={glassSurfaceClassName} */ />
			<MDWrapper />
		</div>
	);
};

export default FloatingNoteEditor;
