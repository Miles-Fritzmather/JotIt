import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import FloatingNoteEditor from "./notepad/FloatingNoteEditor";
import { initAccentTheme } from "./theme";

// Apply the saved accent and subscribe to live changes in whichever window this is.
void initAccentTheme();

const route = document.location.pathname;
if (route === "/floating-note") {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<FloatingNoteEditor />
		</React.StrictMode>,
	);
} else {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}
