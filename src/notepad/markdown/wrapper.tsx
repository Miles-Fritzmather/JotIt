import { MilkdownProvider } from "@milkdown/react";
import { MilkdownEditor } from "./Milkdown";

const MDWrapper = () => {
	return (
		<div
			/* className="markdown-wrapper h-full w-full [&_.milkdown]:h-full [&_.milkdown]:w-full [&_.milkdown]:bg-transparent" */
			autoFocus
		>
			<MilkdownProvider>
				<MilkdownEditor />
			</MilkdownProvider>
		</div>
	);
};

export default MDWrapper;
