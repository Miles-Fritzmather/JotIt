import { MilkdownProvider } from "@milkdown/react";
import { MilkdownEditor } from "./Milkdown";
import "./Milkdown.css";

const MDWrapper = () => {
	return (
		<div className="markdown-wrapper" autoFocus>
			<MilkdownProvider>
				<MilkdownEditor />
			</MilkdownProvider>
		</div>
	);
};

export default MDWrapper;
