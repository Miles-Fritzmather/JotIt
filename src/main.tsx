import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import FloatingNoteEditor from "./FloatingNoteEditor";

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
