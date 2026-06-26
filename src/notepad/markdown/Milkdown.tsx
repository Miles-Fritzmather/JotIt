import { Crepe } from "@milkdown/crepe";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { Milkdown, useEditor } from "@milkdown/react";
import { FC } from "react";

const markdown = `# Hello World!

> Put your notes here...`;

const disableTextServicesAttributes = {
	autocapitalize: "off",
	autocomplete: "off",
	autocorrect: "off",
	spellcheck: "false",
};

function disableAppleTextServices(root: HTMLElement) {
	const editor = root.querySelector<HTMLElement>(".ProseMirror");
	if (!editor) {
		return;
	}

	for (const [name, value] of Object.entries(disableTextServicesAttributes)) {
		editor.setAttribute(name, value);
	}
}

export const MilkdownEditor: FC = () => {
	useEditor((root) => {
		const crepe = new Crepe({
			root,
			defaultValue: markdown,
		});

		crepe.editor.config((ctx) => {
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
	}, []);

	return <Milkdown />;
};
