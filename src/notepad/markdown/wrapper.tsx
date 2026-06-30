import { MilkdownProvider } from "@milkdown/react";
import { MilkdownEditor } from "./Milkdown";

interface MDWrapperProps {
	noteId: string;
	initialMarkdown: string;
	onMarkdownChange: (noteId: string, markdown: string) => void;
}

const MDWrapper = ({
	noteId,
	initialMarkdown,
	onMarkdownChange,
}: MDWrapperProps) => {
	return (
		<div className="h-full w-full" autoFocus id="markdown-wrapper">
			<MilkdownProvider key={noteId}>
				<MilkdownEditor
					noteId={noteId}
					initialMarkdown={initialMarkdown}
					onMarkdownChange={onMarkdownChange}
				/>
			</MilkdownProvider>
		</div>
	);
};

export default MDWrapper;
