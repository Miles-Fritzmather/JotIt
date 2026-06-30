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
	bulletListSchema,
	clearTextInCurrentBlockCommand,
	listItemSchema,
	wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { keymap } from "@milkdown/kit/prose/keymap";
import {
	type Command,
	Selection,
	TextSelection,
} from "@milkdown/kit/prose/state";
import { Milkdown, useEditor } from "@milkdown/react";
import { FC } from "react";

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

// Editor keyboard shortcuts:
//   Cmd/Ctrl + Shift + 8       -> bullet list
//   Cmd/Ctrl + Shift + 9       -> todo (task) list
//   Cmd/Ctrl + Alt + Up/Down   -> move the current list item up/down
//   Cmd/Ctrl + Enter           -> toggle the current todo item
// List creation mirrors Crepe's own block menu so it toggles cleanly.
function listShortcutsPlugin(ctx: Ctx) {
	const wrapInList = (
		nodeType: ReturnType<typeof bulletListSchema.type>,
		attrs?: Record<string, unknown>,
	) => {
		const commands = ctx.get(commandsCtx);
		commands.call(clearTextInCurrentBlockCommand.key);
		return commands.call(wrapInBlockTypeCommand.key, { nodeType, attrs });
	};

	return keymap({
		"Mod-Shift-8": () => wrapInList(bulletListSchema.type(ctx)),
		"Mod-Shift-9": () =>
			wrapInList(listItemSchema.type(ctx), { checked: false }),
		"Mod-Alt-ArrowUp": moveListItem(-1),
		"Mod-Alt-ArrowDown": moveListItem(1),
		"Mod-Enter": toggleTodo,
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
	useEditor(
		(root) => {
			const crepe = new Crepe({
				root,
				defaultValue: initialMarkdown,
				featureConfigs: {
					[Crepe.Feature.BlockEdit]: {
						blockHandle: { shouldShow: () => false },
						// Hide individual slash items by setting them to null:
						textGroup: {
							h4: null,
							h5: null,
							h6: null,
						},
						// Or add custom items:
						buildMenu: (builder) => {
							builder.addGroup("custom", "Custom").addItem("my-item", {
								label: "My block",
								icon: "...",
								onRun: (ctx) => {
									/* ... */
								},
							});
						},
					},
				},
			});

			crepe.on((listener) => {
				listener.markdownUpdated((_ctx, markdown) => {
					onMarkdownChange(noteId, markdown);
				});
				listener.mounted((ctx) => {
					// Defer a frame so the ProseMirror DOM is laid out before we move the cursor/scroll.
					window.requestAnimationFrame(() => focusAtDocumentEnd(ctx));
				});
			});

			crepe.editor.config((ctx) => {
				// Prepend so our bindings get first chance; handlers return false when they don't apply
				// (e.g. Mod-Enter outside a todo), letting Crepe's defaults run.
				ctx.update(prosePluginsCtx, (plugins) => [
					listShortcutsPlugin(ctx),
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
						focus(view, event) {
							disableAppleTextServices(view.dom);
							return options.handleDOMEvents?.focus?.(view, event) ?? false;
						},
					},
				}));
			});

			window.requestAnimationFrame(() => disableAppleTextServices(root));
			return crepe;
		},
		[initialMarkdown, noteId, onMarkdownChange],
	);

	return <Milkdown />;
};
