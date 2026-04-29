import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { Milkdown, useEditor } from "@milkdown/react";
import { FC } from "react";

const markdown = `# Hello World!

> Put your notes here...`;

export const MilkdownEditor: FC = () => {
	useEditor((root) => {
		const crepe = new Crepe({
			root,
			defaultValue: markdown,
		});
		return crepe;
	}, []);

	return <Milkdown />;
};
