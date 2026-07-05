import { toggleMark } from "@milkdown/kit/prose/commands";
import { $command, $markSchema, $remark } from "@milkdown/utils";

/**
 * Underline mark. Markdown has no underline syntax, so it round-trips as inline HTML:
 * serialized as `<u>…</u>`, and on parse the tag pair (which remark splits into separate
 * html nodes around the text) is merged back into a single "underline" mdast node.
 */

interface MdastNode {
	type: string;
	value?: string;
	children?: MdastNode[];
}

function isTag(node: MdastNode, tag: string): boolean {
	return (
		node.type === "html" &&
		typeof node.value === "string" &&
		node.value.trim().toLowerCase() === tag
	);
}

function mergeUnderlineTags(node: MdastNode) {
	const children = node.children;
	if (!children) {
		return;
	}

	for (const child of children) {
		mergeUnderlineTags(child);
	}

	for (let index = 0; index < children.length; index++) {
		if (!isTag(children[index], "<u>")) {
			continue;
		}

		const closeIndex = children.findIndex(
			(child, i) => i > index && isTag(child, "</u>"),
		);
		if (closeIndex === -1) {
			continue;
		}

		children.splice(index, closeIndex - index + 1, {
			type: "underline",
			children: children.slice(index + 1, closeIndex),
		});
	}

	// A paragraph that is exactly "<u>text</u>" parses as one block-level html node instead of
	// a tag pair; unwrap that form too.
	for (let index = 0; index < children.length; index++) {
		const child = children[index];
		if (child.type !== "html" || typeof child.value !== "string") {
			continue;
		}
		const match = /^<u>([\s\S]*)<\/u>$/i.exec(child.value.trim());
		if (!match) {
			continue;
		}
		children[index] = {
			type: "paragraph",
			children: [
				{ type: "underline", children: [{ type: "text", value: match[1] }] },
			],
		};
	}
}

interface ToMarkdownState {
	containerPhrasing: (node: MdastNode, info: object) => string;
}

// `this` is the unified processor; register the serializer for "underline" nodes the same way
// remark-gfm registers its own (remark-stringify reads data("toMarkdownExtensions")).
function remarkUnderline(this: {
	data: () => { toMarkdownExtensions?: unknown[] };
}) {
	const data = this.data();
	const extensions =
		data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
	extensions.push({
		handlers: {
			underline: (
				node: MdastNode,
				_parent: unknown,
				state: ToMarkdownState,
				info: object,
			) => `<u>${state.containerPhrasing(node, info)}</u>`,
		},
	});

	return (tree: MdastNode) => {
		mergeUnderlineTags(tree);
	};
}

export const remarkUnderlinePlugin = $remark(
	"underline",
	() => remarkUnderline,
);

export const underlineSchema = $markSchema("underline", () => ({
	parseDOM: [
		{ tag: "u" },
		{ style: "text-decoration=underline" },
	],
	toDOM: () => ["u", 0] as const,
	parseMarkdown: {
		match: (node) => node.type === "underline",
		runner: (state, node, markType) => {
			state.openMark(markType);
			state.next(node.children);
			state.closeMark(markType);
		},
	},
	toMarkdown: {
		match: (mark) => mark.type.name === "underline",
		runner: (state, mark) => {
			state.withMark(mark, "underline");
		},
	},
}));

export const toggleUnderlineCommand = $command(
	"ToggleUnderline",
	(ctx) => () => toggleMark(underlineSchema.type(ctx)),
);
