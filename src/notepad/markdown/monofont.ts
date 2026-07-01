import { $nodeSchema } from "@milkdown/utils";

const MONOFONT_HTML_RE =
	/class="monofont-block"[^>]*>([\s\S]*?)<\/div>/i;

function extractMonofontText(html: string): string {
	const match = html.match(MONOFONT_HTML_RE);
	return match?.[1] ?? "";
}

export const monofontSchema = $nodeSchema("monofont", () => ({
	content: "inline*",
	group: "block",
	defining: true,
	parseDOM: [{ tag: "div.monofont-block" }],
	toDOM: () => ["div", { class: "monofont-block" }, 0] as const,
	parseMarkdown: {
		match: (node) =>
			node.type === "html" &&
			typeof node.value === "string" &&
			node.value.includes("monofont-block"),
		runner: (state, node, type) => {
			const text = extractMonofontText(node.value as string);
			state.openNode(type);
			if (text) state.addText(text);
			state.closeNode();
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === "monofont",
		runner: (state, node) => {
			let text = "";
			node.content.forEach((child) => {
				if (child.isText) text += child.text;
			});
			state.addNode(
				"html",
				undefined,
				`<div class="monofont-block">${text}</div>`,
			);
		},
	},
}));
