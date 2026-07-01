import { parserCtx, schemaCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { getNodeFromSchema, isTextOnlySlice } from "@milkdown/prose";
import {
	DOMParser,
	DOMSerializer,
	type Slice,
} from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { keymap } from "@milkdown/kit/prose/keymap";
import {
	armOppositePasteMode,
	resolvePasteAsPlain,
} from "../lib/pasteSettings";

function dispatchPasteSlice(view: EditorView, slice: Slice): boolean {
	const node = isTextOnlySlice(slice);
	if (node) {
		view.dispatch(view.state.tr.replaceSelectionWith(node, true));
		return true;
	}

	try {
		view.dispatch(view.state.tr.replaceSelection(slice));
		return true;
	} catch {
		return false;
	}
}

function getPlainTextFromClipboard(clipboardData: DataTransfer): string {
	const plain = clipboardData.getData("text/plain");
	if (plain) {
		return plain.replace(/\r\n?/g, "\n");
	}

	const html = clipboardData.getData("text/html");
	if (!html) {
		return "";
	}

	const container = document.createElement("div");
	container.innerHTML = html;
	return (container.textContent ?? "").replace(/\r\n?/g, "\n");
}

function pasteMarkdownText(view: EditorView, ctx: Ctx, text: string): boolean {
	const parser = ctx.get(parserCtx);
	const parsed = parser(text);
	if (!parsed || typeof parsed === "string") {
		return false;
	}

	const schema = ctx.get(schemaCtx);
	const dom = DOMSerializer.fromSchema(schema).serializeFragment(
		parsed.content,
	);
	const slice = DOMParser.fromSchema(schema).parseSlice(dom);
	return dispatchPasteSlice(view, slice);
}

function pastePlainText(view: EditorView, text: string): boolean {
	const { tr, selection } = view.state;
	if (selection.empty) {
		view.dispatch(tr.insertText(text).scrollIntoView());
		return true;
	}

	view.dispatch(tr.replaceSelectionWith(view.state.schema.text(text)).scrollIntoView());
	return true;
}

export function createPasteFormattingPlugins(ctx: Ctx) {
	const pastePlugin = new Plugin({
		key: new PluginKey("notepad-paste-formatting"),
		props: {
			handlePaste: (view, event, preProcessedSlice) => {
				const editable = view.props.editable?.(view.state);
				if (!editable) {
					return false;
				}

				const { clipboardData } = event;
				if (!clipboardData) {
					return false;
				}

				const currentNode = view.state.selection.$from.node();
				if (currentNode.type.spec.code) {
					return false;
				}

				const pasteAsPlain = resolvePasteAsPlain();
				const text = getPlainTextFromClipboard(clipboardData);
				const vscodeData = clipboardData.getData("vscode-editor-data");

				if (!pasteAsPlain && vscodeData && text) {
					try {
						const data = JSON.parse(vscodeData) as { mode?: string };
						const language = data?.mode;
						if (language) {
							const schema = ctx.get(schemaCtx);
							const codeBlock = getNodeFromSchema("code_block", schema);
							const { tr } = view.state;
							tr.replaceSelectionWith(codeBlock.create({ language }))
								.setSelection(
									TextSelection.near(
										tr.doc.resolve(Math.max(0, tr.selection.from - 2)),
									),
								)
								.insertText(text);
							view.dispatch(tr);
							return true;
						}
					} catch {
						// Fall through to default handlers.
					}
				}

				if (!text) {
					return false;
				}

				if (pasteAsPlain) {
					event.preventDefault();
					return pastePlainText(view, text);
				}

				if (pasteMarkdownText(view, ctx, text)) {
					event.preventDefault();
					return true;
				}

				if (preProcessedSlice && clipboardData.getData("text/html").length > 0) {
					return false;
				}

				return false;
			},
		},
	});

	const pasteKeymap = keymap({
		"Mod-Shift-v": (_state, _dispatch, view) => {
			if (!view) {
				return false;
			}
			armOppositePasteMode();
			view.focus();
			document.execCommand("paste");
			return true;
		},
	});

	return [pastePlugin, pasteKeymap];
}
