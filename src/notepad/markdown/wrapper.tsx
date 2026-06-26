import { MilkdownProvider } from "@milkdown/react";
import { MilkdownEditor } from "./Milkdown";

const MDWrapper = () => {
	return (
		<div className="markdown-wrapper h-full w-full" autoFocus>
			<MilkdownProvider>
				<MilkdownEditor />
			</MilkdownProvider>
		</div>
	);
};

export default MDWrapper;
