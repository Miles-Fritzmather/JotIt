import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { useEffect } from "react";
import "./App.css";
import MDWrapper from "./markdown/wrapper";
import { openFloatingWindow } from "./popup";

function App() {
	async function onShortcut(source: "local" | "global", shortcut: string) {
		console.log("HIT A SHORTCUT!", source, shortcut);

		if (source === "global") {
			void openFloatingWindow();
		}
	}

	useEffect(() => {
		const shortcut = "Control+Shift+J";
		function onLocalKeydown(event: KeyboardEvent) {
			const passed =
				event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m";
			if (passed) {
				event.preventDefault();
				onShortcut("local", "markdown");
			}
		}

		window.addEventListener("keydown", onLocalKeydown);

		register(shortcut, (e) => {
			if (e.state === "Pressed") {
				onShortcut("global", "markdown");
			}
		});

		return () => {
			window.removeEventListener("keydown", onLocalKeydown);
			unregister(shortcut);
		};
	}, []);

	return (
		<main>
			<div
				id="screen"
				className="w-screen h-screen flex items-center justify-center"
			>
				<div className="">
					<MDWrapper />
				</div>
			</div>
		</main>
	);
}

export default App;
