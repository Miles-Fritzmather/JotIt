import FloatingNoteEditor from "./FloatingNoteEditor";
import { ErrorsProvider } from "./providers/useErrors";
import { FocusProvider } from "./providers/useFocus";
import { NotesProvider } from "./providers/useNotes";

const Root = () => {
	return (
		<ErrorsProvider>
			<FocusProvider>
				<NotesProvider>
					<FloatingNoteEditor />
				</NotesProvider>
			</FocusProvider>
		</ErrorsProvider>
	);
};

export default Root;
