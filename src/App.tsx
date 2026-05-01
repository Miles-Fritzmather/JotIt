import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { useEffect } from "react";
import "./App.css";
import MDWrapper from "./markdown/wrapper";
import { toggleFloatingWindow } from "./popup";

const TOGGLE_POP_UP_KEYBIND = "Control+Shift+J";

function App() {
	async function onShortcut(source: "local" | "global", shortcut: string) {
		console.log("HIT A SHORTCUT!", source, shortcut);

		if (source === "global") {
			try {
				await toggleFloatingWindow();
			} catch (error) {
				console.error("Failed to toggle floating window", error);
			}
		}
	}

	useEffect(() => {
		let disposed = false;

		const registration = (async () => {
			await unregister(TOGGLE_POP_UP_KEYBIND).catch(() => {});
			if (disposed) return;

			await register(TOGGLE_POP_UP_KEYBIND, (e) => {
				if (disposed) return;
				if (e.state === "Pressed") void onShortcut("global", "markdown");
			});
		})().catch((error) => {
			console.error("Failed to register global shortcut", error);
		});

		return () => {
			disposed = true;
			void registration.then(() =>
				unregister(TOGGLE_POP_UP_KEYBIND).catch((error) => {
					console.error("Failed to unregister global shortcut", error);
				}),
			);
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
