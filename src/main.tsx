import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./app/App.css";
import Root from "./notepad/Root";
import { initAccentTheme } from "./theme";

// Apply the saved accent and subscribe to live changes in whichever window this is.
void initAccentTheme();

function isFloatingNoteWindow(): boolean {
	const path = document.location.pathname;
	if (
		path === "/floating-note" ||
		path === "/floating-note.html" ||
		path.endsWith("/floating-note") ||
		path.endsWith("/floating-note.html")
	) {
		return true;
	}

	if (isTauri()) {
		return getCurrentWebviewWindow().label === "floating-note";
	}

	return false;
}

const root = document.getElementById("root") as HTMLElement;

if (isFloatingNoteWindow()) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<Root />
		</React.StrictMode>,
	);
} else {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}
