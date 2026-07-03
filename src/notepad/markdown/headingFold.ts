import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
	type EditorState,
	Plugin,
	PluginKey,
	TextSelection,
} from "@milkdown/kit/prose/state";
import {
	Decoration,
	DecorationSet,
	type EditorView,
} from "@milkdown/kit/prose/view";

interface HeadingFoldState {
	/** Positions of collapsed top-level headings, mapped through document edits. */
	collapsed: number[];
}

const foldKey = new PluginKey<HeadingFoldState>("notetaker-heading-fold");

const chevronSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
`;

function isHeading(node: ProseNode | null | undefined): node is ProseNode {
	return node?.type.name === "heading";
}

/**
 * The content a heading owns: everything after it up to (not including) the next top-level
 * heading of the same or higher level, or the end of the document.
 */
function sectionRange(
	doc: ProseNode,
	headingPos: number,
): { from: number; to: number } | null {
	const heading = doc.nodeAt(headingPos);
	if (!isHeading(heading)) {
		return null;
	}

	const level = heading.attrs.level as number;
	const from = headingPos + heading.nodeSize;
	let to = from;

	let pos = 0;
	for (let index = 0; index < doc.childCount; index++) {
		const child = doc.child(index);
		if (pos > headingPos) {
			if (isHeading(child) && (child.attrs.level as number) <= level) {
				break;
			}
			to = pos + child.nodeSize;
		}
		pos += child.nodeSize;
	}

	return to > from ? { from, to } : null;
}

function makeChevron(view: EditorView, headingPos: number, collapsed: boolean) {
	const button = document.createElement("span");
	button.className = collapsed
		? "heading-fold-chevron collapsed"
		: "heading-fold-chevron";
	button.contentEditable = "false";
	button.setAttribute("role", "button");
	button.setAttribute(
		"aria-label",
		collapsed ? "Expand section" : "Collapse section",
	);
	button.title = collapsed ? "Expand section" : "Collapse section";
	button.innerHTML = chevronSvg;
	// mousedown (not click) so the editor never sees it and the selection doesn't jump.
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		event.stopPropagation();
		view.dispatch(view.state.tr.setMeta(foldKey, { toggle: headingPos }));
	});
	return button;
}

function buildDecorations(state: EditorState) {
	const pluginState = foldKey.getState(state);
	if (!pluginState) {
		return DecorationSet.empty;
	}

	const { doc } = state;
	const decorations: Decoration[] = [];

	doc.forEach((child, offset) => {
		if (!isHeading(child)) {
			return;
		}

		const collapsed = pluginState.collapsed.includes(offset);
		decorations.push(
			Decoration.widget(
				offset + 1,
				(view) => makeChevron(view, offset, collapsed),
				{
					side: -1,
					ignoreSelection: true,
					key: `heading-fold-${offset}-${collapsed}`,
				},
			),
		);

		if (!collapsed) {
			return;
		}

		const range = sectionRange(doc, offset);
		if (!range) {
			return;
		}

		// Hide each block in the section. Node decorations must span exactly one node, so walk
		// the top-level children inside the range.
		let pos = range.from;
		while (pos < range.to) {
			const block = doc.nodeAt(pos);
			if (!block) {
				break;
			}
			decorations.push(
				Decoration.node(pos, pos + block.nodeSize, {
					class: "heading-fold-hidden",
				}),
			);
			pos += block.nodeSize;
		}
	});

	return DecorationSet.create(doc, decorations);
}

/**
 * Apple Notes-style section folding. Every top-level heading gets a hover chevron in the left
 * margin; clicking it hides the heading's content until the next same-or-higher-level heading.
 * Fold state is view-only (decorations + plugin state), so the markdown on disk is untouched,
 * and positions are remapped as the document is edited.
 */
export function createHeadingFoldPlugin() {
	return new Plugin<HeadingFoldState>({
		key: foldKey,
		state: {
			init: () => ({ collapsed: [] }),
			apply(tr, value, _oldState, newState) {
				let collapsed = value.collapsed;

				if (tr.docChanged) {
					collapsed = collapsed.map((pos) => tr.mapping.map(pos));
				}

				const meta = tr.getMeta(foldKey) as { toggle: number } | undefined;
				if (meta) {
					collapsed = collapsed.includes(meta.toggle)
						? collapsed.filter((pos) => pos !== meta.toggle)
						: [...collapsed, meta.toggle];
				}

				// Edits can delete a folded heading or merge it away; drop stale entries.
				collapsed = collapsed.filter((pos) =>
					isHeading(newState.doc.nodeAt(pos)),
				);

				return { collapsed: [...new Set(collapsed)] };
			},
		},
		appendTransaction(transactions, _oldState, newState) {
			// If a fold just swallowed the cursor, move it to the end of the folded heading so
			// typing doesn't continue invisibly inside the hidden section.
			if (!transactions.some((tr) => tr.getMeta(foldKey))) {
				return null;
			}

			const pluginState = foldKey.getState(newState);
			if (!pluginState) {
				return null;
			}

			const selection = newState.selection;
			for (const headingPos of pluginState.collapsed) {
				const range = sectionRange(newState.doc, headingPos);
				if (!range || selection.from < range.from || selection.from >= range.to) {
					continue;
				}

				const heading = newState.doc.nodeAt(headingPos);
				if (!heading) {
					continue;
				}
				return newState.tr.setSelection(
					TextSelection.create(newState.doc, headingPos + heading.nodeSize - 1),
				);
			}

			return null;
		},
		props: {
			decorations: buildDecorations,
		},
	});
}
