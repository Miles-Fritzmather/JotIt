import { commandsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
import {
	addBlockTypeCommand,
	bulletListSchema,
	clearTextInCurrentBlockCommand,
	codeBlockSchema,
	createCodeBlockCommand,
	listItemSchema,
	setBlockTypeCommand,
	toggleEmphasisCommand,
	toggleInlineCodeCommand,
	toggleStrongCommand,
	wrapInBlockquoteCommand,
	wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { Plugin } from "@milkdown/kit/prose/state";
import { type ShortcutActionId, shortcutMatches } from "../lib/shortcuts";
import { monofontSchema } from "./monofont";
import { toggleUnderlineCommand } from "./underline";

const FORMATTING_ACTIONS: ShortcutActionId[] = [
	"bold",
	"italic",
	"underline",
	"strikethrough",
	"inlineCode",
	"link",
	"quoteBlock",
	"codeBlock",
	"mathBlock",
	"monofontBlock",
	"bulletList",
	"todoList",
];

function runFormattingAction(ctx: Ctx, action: ShortcutActionId): boolean {
	const commands = ctx.get(commandsCtx);

	// List creation mirrors Crepe's own block menu (clear, then wrap) so it toggles cleanly.
	const wrapInList = (
		nodeType: ReturnType<typeof bulletListSchema.type>,
		attrs?: Record<string, unknown>,
	) => {
		commands.call(clearTextInCurrentBlockCommand.key);
		return commands.call(wrapInBlockTypeCommand.key, { nodeType, attrs });
	};

	switch (action) {
		case "bold":
			return commands.call(toggleStrongCommand.key);
		case "italic":
			return commands.call(toggleEmphasisCommand.key);
		case "underline":
			return commands.call(toggleUnderlineCommand.key);
		case "strikethrough":
			return commands.call(toggleStrikethroughCommand.key);
		case "inlineCode":
			return commands.call(toggleInlineCodeCommand.key);
		case "link":
			return commands.call(toggleLinkCommand.key);
		case "quoteBlock":
			return commands.call(wrapInBlockquoteCommand.key);
		case "codeBlock":
			return commands.call(createCodeBlockCommand.key);
		case "mathBlock":
			// A math block is Crepe's LaTeX-flavored code block (same as its slash menu "Math").
			return commands.call(addBlockTypeCommand.key, {
				nodeType: codeBlockSchema.type(ctx),
				attrs: { language: "LaTeX" },
			});
		case "monofontBlock":
			return commands.call(setBlockTypeCommand.key, {
				nodeType: monofontSchema.type(ctx),
			});
		case "bulletList":
			return wrapInList(bulletListSchema.type(ctx));
		case "todoList":
			return wrapInList(listItemSchema.type(ctx), { checked: false });
		default:
			return false;
	}
}

/**
 * Formatting shortcuts that consult the configurable registry at keydown time, so rebinding a
 * shortcut in Settings applies immediately without rebuilding the editor. Prepended before
 * Crepe's plugins, so these win any conflicts with built-in bindings.
 */
export function createFormattingShortcutsPlugin(ctx: Ctx) {
	return new Plugin({
		props: {
			handleKeyDown: (_view, event) => {
				// Ignore bare keypresses early; every formatting binding requires a modifier.
				if (!event.metaKey && !event.ctrlKey && !event.altKey) {
					return false;
				}

				for (const action of FORMATTING_ACTIONS) {
					if (!shortcutMatches(action, event)) {
						continue;
					}
					event.preventDefault();
					return runFormattingAction(ctx, action);
				}

				return false;
			},
		},
	});
}
