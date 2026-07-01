import type { EditorView } from "@milkdown/kit/prose/view";
import {
	clearEditorSearch,
	setEditorSearch,
	stepEditorSearch,
	type EditorSearchState,
} from "./editorSearch";

let editorView: EditorView | null = null;
let searchState: EditorSearchState = {
	query: "",
	activeIndex: 0,
	matches: [],
};
const searchListeners = new Set<(state: EditorSearchState) => void>();

function configureEditorScroll(view: EditorView) {
	const scrollParent = view.dom.closest<HTMLElement>(".milkdown .editor");
	if (!scrollParent) {
		return;
	}

	(view as EditorView & { scrollDOM: HTMLElement }).scrollDOM = scrollParent;
}

export function registerEditorView(view: EditorView) {
	configureEditorScroll(view);
	editorView = view;
}

export function unregisterEditorView(view?: EditorView) {
	if (!view || editorView === view) {
		editorView = null;
	}
}

export function getEditorView() {
	return editorView;
}

export function publishEditorSearchState(state: EditorSearchState) {
	searchState = state;
	for (const listener of searchListeners) {
		listener(state);
	}
}

export function subscribeEditorSearch(listener: (state: EditorSearchState) => void) {
	listener(searchState);
	searchListeners.add(listener);
	return () => {
		searchListeners.delete(listener);
	};
}

export function updateEditorSearch(query: string, activeIndex = 0) {
	if (!editorView) {
		return;
	}
	setEditorSearch(editorView, query, activeIndex);
}

export function clearEditorSearchBridge() {
	if (!editorView) {
		return;
	}
	clearEditorSearch(editorView);
}

export function stepEditorSearchMatch(direction: 1 | -1) {
	if (!editorView) {
		return;
	}
	stepEditorSearch(editorView, direction);
}
