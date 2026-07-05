import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
	commandsCtx,
	editorViewCtx,
	editorViewOptionsCtx,
	prosePluginsCtx,
} from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
	clearTextInCurrentBlockCommand,
	isMarkSelectedCommand,
	listItemSchema,
	paragraphSchema,
	setBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
	type Command,
	Selection,
	TextSelection,
} from "@milkdown/kit/prose/state";
import { Milkdown, useEditor } from "@milkdown/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FC, useEffect } from "react";
import {
	clearEditorSearchBridge,
	publishEditorSearchState,
	registerEditorView,
	unregisterEditorView,
} from "./editorBridge";
import { createEditorSearchPlugin } from "./editorSearch";
import { createFormattingShortcutsPlugin } from "./formattingShortcuts";
import { createHeadingFoldPlugin } from "./headingFold";
import { monofontSchema } from "./monofont";
import { createPasteFormattingPlugins } from "./pasteFormatting";
import {
	remarkUnderlinePlugin,
	toggleUnderlineCommand,
	underlineSchema,
} from "./underline";

const monofontIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_monofont)">
      <path
        d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_monofont">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`;

const underlineIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <line x1="4" x2="20" y1="20" y2="20" />
  </svg>
`;

const disableTextServicesAttributes = {
	autocapitalize: "off",
	autocomplete: "off",
	autocorrect: "off",
	spellcheck: "false",
};

interface MilkdownEditorProps {
	noteId: string;
	initialMarkdown: string;
	onMarkdownChange: (noteId: string, markdown: string) => void;
}

// Walk up from the selection to the nearest list item, returning its depth (or null).
function listItemDepth(state: Parameters<Command>[0]): number | null {
	const { $from } = state.selection;
	for (let depth = $from.depth; depth > 0; depth--) {
		if ($from.node(depth).type.name === "list_item") {
			return depth;
		}
	}
	return null;
}

// Reorder the current list item among its siblings (dir: -1 up, +1 down).
function moveListItem(dir: -1 | 1): Command {
	return (state, dispatch) => {
		const depth = listItemDepth(state);
		if (depth === null) return false;

		const { $from } = state.selection;
		const listDepth = depth - 1;
		const index = $from.index(listDepth);
		const parent = $from.node(listDepth);
		const target = index + dir;
		if (target < 0 || target >= parent.childCount) return false;
		if (!dispatch) return true;

		const item = $from.node(depth);
		const before = $from.before(depth);
		const cursorOffset = state.selection.from - before;

		const sibling = parent.child(target);
		const insertPos =
			dir === -1 ? before - sibling.nodeSize : before + sibling.nodeSize;

		const tr = state.tr
			.delete(before, before + item.nodeSize)
			.insert(insertPos, item);
		const selection = TextSelection.near(
			tr.doc.resolve(insertPos + cursorOffset),
		);
		dispatch(tr.setSelection(selection).scrollIntoView());
		return true;
	};
}

// Toggle the checkbox of the nearest task-list item. No-op on plain (non-task) list items.
const toggleTodo: Command = (state, dispatch) => {
	const depth = listItemDepth(state);
	if (depth === null) return false;

	const { $from } = state.selection;
	const item = $from.node(depth);
	if (item.attrs.checked == null) return false;
	if (dispatch) {
		const pos = $from.before(depth);
		dispatch(
			state.tr.setNodeMarkup(pos, undefined, {
				...item.attrs,
				checked: !item.attrs.checked,
			}),
		);
	}
	return true;
};

// Block that represents the current "line" (list item, or top-level / blockquote block).
function getLineBlockDepth($from: Parameters<Command>[0]["selection"]["$from"]): number {
	for (let d = $from.depth; d > 0; d--) {
		if ($from.node(d).type.name === "list_item") return d;
	}
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		const parent = $from.node(d - 1);
		if (
			node.isBlock &&
			(parent.type.name === "doc" || parent.type.name === "blockquote")
		) {
			return d;
		}
	}
	return $from.depth;
}

function createEmptyLineBlock(ctx: Ctx, reference: ProseNode): ProseNode {
	const para = paragraphSchema.type(ctx).create();
	if (reference.type.name === "list_item") {
		const attrs = { ...reference.attrs };
		if (attrs.checked != null) {
			attrs.checked = false;
		}
		return listItemSchema.type(ctx).create(attrs, para);
	}
	return para;
}

// Cmd+Enter on a checklist item toggles it; otherwise inserts a line below (VS Code-style).
function modEnter(ctx: Ctx): Command {
	return (state, dispatch, view) => {
		if (toggleTodo(state, dispatch)) return true;
		return insertLineRelative(ctx, "below")(state, dispatch, view);
	};
}

// VS Code-style line insertion: new empty line above/below without changing the current line.
function insertLineRelative(ctx: Ctx, direction: "above" | "below"): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		const depth = getLineBlockDepth($from);
		if (depth < 1) return false;

		const block = $from.node(depth);
		const insertPos =
			direction === "below" ? $from.after(depth) : $from.before(depth);
		const newBlock = createEmptyLineBlock(ctx, block);

		if (!dispatch) return true;

		const tr = state.tr.insert(insertPos, newBlock);
		const $sel = TextSelection.near(tr.doc.resolve(insertPos + 1), 1);
		dispatch(tr.setSelection($sel).scrollIntoView());
		return true;
	};
}

// Fixed editor keyboard shortcuts (the configurable ones live in formattingShortcuts.ts):
//   Cmd/Ctrl + Alt + Up/Down   -> move the current list item up/down
//   Cmd/Ctrl + Enter           -> toggle checklist item, or insert line below
//   Cmd/Ctrl + Shift + Enter   -> insert line above
//   Cmd/Ctrl + Alt + Enter     -> toggle the current todo item
function openExternalLink(href: string) {
	void openUrl(href).catch(() => {
		window.open(href, "_blank", "noopener,noreferrer");
	});
}

function handleLinkClick(view: EditorView, event: MouseEvent) {
	if (event.button !== 0) {
		return false;
	}

	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const editorRoot =
		view.dom.closest<HTMLElement>(".milkdown") ?? view.dom.parentElement;
	if (!editorRoot) {
		return false;
	}

	const anchor = target.closest("a[href]");
	if (!anchor || !editorRoot.contains(anchor)) {
		return false;
	}

	const href = anchor.getAttribute("href");
	if (!href || href.startsWith("#")) {
		return false;
	}

	event.preventDefault();
	event.stopPropagation();
	openExternalLink(href);
	return true;
}

function listShortcutsPlugin(ctx: Ctx) {
	return keymap({
		"Mod-Alt-ArrowUp": moveListItem(-1),
		"Mod-Alt-ArrowDown": moveListItem(1),
		"Mod-Enter": modEnter(ctx),
		"Mod-Shift-Enter": insertLineRelative(ctx, "above"),
		"Mod-Alt-Enter": toggleTodo,
	});
}

// Drop the cursor at the very end of the document and focus the editor. Called on mount, so a
// freshly created note or one navigated to opens ready to type at the end of its text.
function focusAtDocumentEnd(ctx: Ctx) {
	const view = ctx.get(editorViewCtx);
	const selection = Selection.atEnd(view.state.doc);
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
	view.focus();
}

// Crepe's code/LaTeX block copy button gives no feedback on click; briefly swap its label to
// "Copied!" and set data-copied so CSS can flash it accent-colored.
function flashCopyFeedback(event: MouseEvent) {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const button = target.closest<HTMLElement>(".copy-button");
	if (!button || button.dataset.copied) {
		return;
	}

	button.dataset.copied = "true";
	const label = Array.from(button.childNodes).find(
		(node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
	);
	const originalText = label?.textContent ?? null;
	if (label) {
		label.textContent = "Copied!";
	}

	window.setTimeout(() => {
		delete button.dataset.copied;
		if (label && originalText !== null) {
			label.textContent = originalText;
		}
	}, 1200);
}

function disableAppleTextServices(root: HTMLElement) {
	const editor = root.querySelector<HTMLElement>(".ProseMirror");
	if (!editor) {
		return;
	}

	for (const [name, value] of Object.entries(disableTextServicesAttributes)) {
		editor.setAttribute(name, value);
	}
}

export const MilkdownEditor: FC<MilkdownEditorProps> = ({
	noteId,
	initialMarkdown,
	onMarkdownChange,
}) => {
	useEffect(() => {
		return () => {
			clearEditorSearchBridge();
			unregisterEditorView();
		};
	}, [noteId]);

	useEditor(
		(root) => {
			const crepe = new Crepe({
				root,
				defaultValue: initialMarkdown,
				featureConfigs: {
					[Crepe.Feature.Cursor]: {
						virtual: false,
					},
					[Crepe.Feature.Toolbar]: {
						buildToolbar: (builder) => {
							builder.getGroup("formatting").addItem("underline", {
								icon: underlineIcon,
								active: (itemCtx) =>
									itemCtx
										.get(commandsCtx)
										.call(
											isMarkSelectedCommand.key,
											underlineSchema.type(itemCtx),
										),
								onRun: (itemCtx) =>
									itemCtx.get(commandsCtx).call(toggleUnderlineCommand.key),
							});
						},
					},
					[Crepe.Feature.BlockEdit]: {
						blockHandle: { shouldShow: () => false },
						// Hide individual slash items by setting them to null:
						textGroup: {
							h4: null,
							h5: null,
							h6: null,
						},
						buildMenu: (builder) => {
							builder.addGroup("basic", "Basic").addItem("monofont", {
								label: "Monofont",
								icon: monofontIcon,
								onRun: (ctx) => {
									const commands = ctx.get(commandsCtx);
									commands.call(clearTextInCurrentBlockCommand.key);
									commands.call(setBlockTypeCommand.key, {
										nodeType: monofontSchema.type(ctx),
									});
								},
							});
						},
					},
				},
			});

			crepe.editor
				.use(monofontSchema)
				.use(remarkUnderlinePlugin)
				.use(underlineSchema)
				.use(toggleUnderlineCommand);

			crepe.on((listener) => {
				listener.markdownUpdated((_ctx, markdown) => {
					onMarkdownChange(noteId, markdown);
				});
				listener.mounted((ctx) => {
					registerEditorView(ctx.get(editorViewCtx));
					// Defer a frame so the ProseMirror DOM is laid out before we move the cursor/scroll.
					window.requestAnimationFrame(() => focusAtDocumentEnd(ctx));
				});
			});

			crepe.editor.config((ctx) => {
				// Prepend so our bindings get first chance; handlers return false when they don't apply
				// (e.g. Mod-Enter outside a todo), letting Crepe's defaults run.
				ctx.update(prosePluginsCtx, (plugins) => [
					...createPasteFormattingPlugins(ctx),
					createFormattingShortcutsPlugin(ctx),
					listShortcutsPlugin(ctx),
					createEditorSearchPlugin(publishEditorSearchState),
					createHeadingFoldPlugin(),
					...plugins,
				]);

				ctx.update(editorViewOptionsCtx, (options) => ({
					...options,
					attributes: {
						...options.attributes,
						...disableTextServicesAttributes,
					},
					handleDOMEvents: {
						...options.handleDOMEvents,
						click(view, event) {
							if (handleLinkClick(view, event)) {
								return true;
							}
							return options.handleDOMEvents?.click?.(view, event) ?? false;
						},
						focus(view, event) {
							disableAppleTextServices(view.dom);
							return options.handleDOMEvents?.focus?.(view, event) ?? false;
						},
					},
				}));
			});

			root.addEventListener("click", flashCopyFeedback);
			window.requestAnimationFrame(() => disableAppleTextServices(root));
			return crepe;
		},
		[initialMarkdown, noteId, onMarkdownChange],
	);

	return <Milkdown />;
};
