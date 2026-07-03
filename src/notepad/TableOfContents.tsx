import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./lib/utils";

interface TocHeading {
	text: string;
	level: number;
	element: HTMLElement;
}

// Wider line = bigger heading, like Notion's collapsed outline.
const LEVEL_LINE_WIDTHS: Record<number, number> = {
	1: 24,
	2: 17,
	3: 12,
	4: 8,
	5: 8,
	6: 8,
};

// How far below the scroll container's top a heading can sit and still count as "current".
const ACTIVE_OFFSET_PX = 80;

function findScrollContainer() {
	return document.querySelector<HTMLElement>(
		"#floating-note-editor .milkdown .editor",
	);
}

function sameHeadings(a: TocHeading[], b: TocHeading[]) {
	return (
		a.length === b.length &&
		a.every(
			(heading, index) =>
				heading.element === b[index].element &&
				heading.text === b[index].text &&
				heading.level === b[index].level,
		)
	);
}

/**
 * Notion-style floating table of contents. Collapsed, it renders one accent line per heading
 * (longer lines for higher-level headings) in the top-right corner; the line for the section
 * currently scrolled into view is emphasized. Hovering expands it into a clickable outline.
 *
 * The heading list is read straight from the ProseMirror DOM (via MutationObserver) rather than
 * the markdown, so it stays in sync with what the editor actually renders.
 */
const TableOfContents = ({ noteId }: { noteId: string }) => {
	const [headings, setHeadings] = useState<TocHeading[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [isExpanded, setIsExpanded] = useState(false);
	const headingsRef = useRef<TocHeading[]>([]);

	const collect = useCallback(() => {
		const editor = findScrollContainer();
		if (!editor) {
			headingsRef.current = [];
			setHeadings([]);
			return;
		}

		const elements = Array.from(
			editor.querySelectorAll<HTMLElement>(
				".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6",
			),
			// Skip headings hidden inside a collapsed section (offsetParent is null for display: none).
		).filter((element) => element.offsetParent !== null);
		const next = elements.map((element) => ({
			text: element.textContent?.trim() || "Untitled",
			level: Number(element.tagName.charAt(1)),
			element,
		}));

		if (!sameHeadings(headingsRef.current, next)) {
			headingsRef.current = next;
			setHeadings(next);
		}

		// The active section is the last heading at or above the top of the viewport.
		const containerTop = editor.getBoundingClientRect().top;
		let active = 0;
		next.forEach((heading, index) => {
			if (
				heading.element.getBoundingClientRect().top - containerTop <=
				ACTIVE_OFFSET_PX
			) {
				active = index;
			}
		});
		setActiveIndex(active);
	}, []);

	useEffect(() => {
		const root = document.getElementById("floating-note-editor");
		if (!root) {
			return;
		}

		let frame = 0;
		const schedule = () => {
			if (frame) {
				return;
			}
			frame = window.requestAnimationFrame(() => {
				frame = 0;
				collect();
			});
		};

		const observer = new MutationObserver(schedule);
		observer.observe(root, {
			childList: true,
			subtree: true,
			characterData: true,
			// Section folding hides blocks by toggling classes; watch those too.
			attributes: true,
			attributeFilter: ["class"],
		});
		// Scroll events don't bubble, but a capture-phase listener on the shell still sees the
		// editor's scrolls — no need to wait for the async Milkdown mount to attach directly.
		root.addEventListener("scroll", schedule, {
			capture: true,
			passive: true,
		});
		schedule();

		return () => {
			observer.disconnect();
			root.removeEventListener("scroll", schedule, { capture: true });
			window.cancelAnimationFrame(frame);
		};
	}, [collect, noteId]);

	if (headings.length === 0) {
		return null;
	}

	// Indent relative to the shallowest heading present so notes starting at h2 don't over-indent.
	const minLevel = Math.min(...headings.map((heading) => heading.level));

	return (
		<div
			className="absolute right-1 top-12 z-30 flex max-h-[70%] justify-end"
			onMouseEnter={() => setIsExpanded(true)}
			onMouseLeave={() => setIsExpanded(false)}
		>
			{isExpanded ? (
				<div className="w-52 overflow-y-auto rounded-lg border border-white/15 bg-neutral-950/10 py-1.5 backdrop-blur-2xl">
					{headings.map((heading, index) => (
						<button
							key={`${index}-${heading.text}`}
							type="button"
							onClick={() =>
								heading.element.scrollIntoView({
									behavior: "smooth",
									block: "start",
								})
							}
							className={cn(
								"block w-full truncate py-1 pr-3 text-left text-[12px] transition-colors",
								index === activeIndex
									? "font-medium text-accent"
									: "text-white/60 hover:text-white",
							)}
							style={{
								paddingLeft: 12 + (heading.level - minLevel) * 12,
							}}
						>
							{heading.text}
						</button>
					))}
				</div>
			) : (
				<div className="flex flex-col items-end gap-[5px] overflow-hidden px-2 py-2">
					{headings.map((heading, index) => (
						<div
							key={`${index}-${heading.level}`}
							className={cn(
								"h-[2px] shrink-0 rounded-full transition-colors duration-200",
								index === activeIndex ? "bg-accent" : "bg-accent/35",
							)}
							style={{ width: LEVEL_LINE_WIDTHS[heading.level] ?? 8 }}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default TableOfContents;
