import { MilkdownProvider } from "@milkdown/react";
import { MilkdownEditor } from "./Milkdown";

interface MDWrapperProps {
	noteId: string;
	initialMarkdown: string;
	onMarkdownChange: (noteId: string, markdown: string) => void;
	zoom?: number;
}

const MDWrapper = ({
	noteId,
	initialMarkdown,
	onMarkdownChange,
	zoom = 1,
}: MDWrapperProps) => {
	return (
		<div
			className="h-full w-full"
			autoFocus
			id="markdown-wrapper"
			style={{ "--editor-zoom": zoom } as React.CSSProperties}
		>
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
