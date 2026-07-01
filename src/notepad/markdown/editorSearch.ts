import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

export type EditorSearchMatch = {
	from: number;
	to: number;
};

export type EditorSearchState = {
	query: string;
	activeIndex: number;
	matches: EditorSearchMatch[];
};

export const editorSearchPluginKey = new PluginKey<EditorSearchState>(
	"editorSearch",
);

const emptyState: EditorSearchState = {
	query: "",
	activeIndex: 0,
	matches: [],
};

export function findMatches(
	doc: ProseNode,
	query: string,
): EditorSearchMatch[] {
	const trimmed = query.trim();
	if (!trimmed) {
		return [];
	}

	const lowerQuery = trimmed.toLowerCase();
	const matches: EditorSearchMatch[] = [];

	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) {
			return;
		}

		const lowerText = node.text.toLowerCase();
		let index = 0;
		while ((index = lowerText.indexOf(lowerQuery, index)) !== -1) {
			matches.push({
				from: pos + index,
				to: pos + index + trimmed.length,
			});
			index += trimmed.length || 1;
		}
	});

	return matches;
}

function clampIndex(index: number, matchCount: number) {
	if (matchCount === 0) {
		return 0;
	}
	return ((index % matchCount) + matchCount) % matchCount;
}

const FIND_SCROLL_TOP_PADDING = 96;

type ScrollableEditorView = EditorView & { scrollDOM: HTMLElement };

function getScrollContainer(view: EditorView): HTMLElement {
	const scrollableView = view as ScrollableEditorView;
	if (scrollableView.scrollDOM !== view.dom) {
		return scrollableView.scrollDOM;
	}

	return view.dom.closest<HTMLElement>(".milkdown .editor") ?? view.dom;
}

function scrollMatchIntoContainer(
	view: EditorView,
	container: HTMLElement,
	match: EditorSearchMatch,
) {
	const start = view.coordsAtPos(match.from);
	const end = view.coordsAtPos(match.to);
	const containerRect = container.getBoundingClientRect();

	const matchTop = Math.min(start.top, end.top);
	const matchBottom = Math.max(start.bottom, end.bottom);
	const matchCenter = (matchTop + matchBottom) / 2;
	const targetCenter =
		containerRect.top +
		FIND_SCROLL_TOP_PADDING +
		(containerRect.bottom - containerRect.top - FIND_SCROLL_TOP_PADDING) / 2;

	container.scrollBy({ top: matchCenter - targetCenter, behavior: "smooth" });
}

function ensureMatchVisible(view: EditorView, match: EditorSearchMatch) {
	const scrollContainer = getScrollContainer(view);
	requestAnimationFrame(() => {
		scrollMatchIntoContainer(view, scrollContainer, match);
	});
}

export function createEditorSearchPlugin(
	onStateChange?: (state: EditorSearchState) => void,
) {
	return new Plugin<EditorSearchState>({
		key: editorSearchPluginKey,
		state: {
			init() {
				return emptyState;
			},
			apply(tr, value) {
				const meta = tr.getMeta(editorSearchPluginKey) as
					| Partial<EditorSearchState>
					| undefined;
				if (meta) {
					return { ...value, ...meta };
				}

				if (tr.docChanged && value.query) {
					const matches = findMatches(tr.doc, value.query);
					return {
						query: value.query,
						activeIndex: clampIndex(value.activeIndex, matches.length),
						matches,
					};
				}

				return value;
			},
		},
		props: {
			decorations(state) {
				const pluginState = editorSearchPluginKey.getState(state);
				if (!pluginState?.query || pluginState.matches.length === 0) {
					return null;
				}

				const decorations = pluginState.matches.map((match, index) =>
					Decoration.inline(match.from, match.to, {
						class:
							index === pluginState.activeIndex
								? "editor-search-match active"
								: "editor-search-match",
					}),
				);

				return DecorationSet.create(state.doc, decorations);
			},
		},
		view(view) {
			const notify = () => {
				const state = editorSearchPluginKey.getState(view.state);
				if (state) {
					onStateChange?.(state);
				}
			};

			notify();

			return {
				update(updatedView, prevState) {
					const prev = editorSearchPluginKey.getState(prevState);
					const next = editorSearchPluginKey.getState(updatedView.state);
					if (
						prev?.query !== next?.query ||
						prev?.activeIndex !== next?.activeIndex ||
						prev?.matches.length !== next?.matches.length
					) {
						notify();
					}
				},
			};
		},
	});
}

export function setEditorSearch(
	view: EditorView,
	query: string,
	activeIndex = 0,
) {
	const matches = findMatches(view.state.doc, query);
	const nextIndex = clampIndex(activeIndex, matches.length);
	let tr = view.state.tr.setMeta(editorSearchPluginKey, {
		query,
		activeIndex: nextIndex,
		matches,
	});

	if (matches.length > 0) {
		const match = matches[nextIndex];
		tr = tr
			.setSelection(
				TextSelection.create(view.state.doc, match.from, match.to),
			)
			.scrollIntoView();
	}

	view.dispatch(tr);

	if (matches.length > 0) {
		ensureMatchVisible(view, matches[nextIndex]);
	}
}

export function clearEditorSearch(view: EditorView) {
	const tr = view.state.tr.setMeta(editorSearchPluginKey, emptyState);
	view.dispatch(tr);
}

export function stepEditorSearch(view: EditorView, direction: 1 | -1) {
	const state = editorSearchPluginKey.getState(view.state) ?? emptyState;
	if (!state.query || state.matches.length === 0) {
		return;
	}

	const activeIndex = clampIndex(
		state.activeIndex + direction,
		state.matches.length,
	);
	const match = state.matches[activeIndex];
	const tr = view.state.tr
		.setMeta(editorSearchPluginKey, {
			...state,
			activeIndex,
		})
		.setSelection(TextSelection.create(view.state.doc, match.from, match.to))
		.scrollIntoView();
	view.dispatch(tr);
	ensureMatchVisible(view, match);
}
