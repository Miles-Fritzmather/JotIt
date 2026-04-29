import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const FLOATING_WINDOW = "floating-note";

export async function openFloatingWindow() {
	console.log("opening floating window");
	const existing = await WebviewWindow.getByLabel(FLOATING_WINDOW);

	if (existing) {
		console.log("existing found, showing");
		await existing.setAlwaysOnTop(true);
		await existing.show();
		await existing.setFocus();
		return existing;
	}

	console.log("creating new window");
	const newWindow = new WebviewWindow(FLOATING_WINDOW, {
		url: "/",
		title: "Quick Note",
		width: 600,
		height: 500,
		alwaysOnTop: true,
		focus: true,
		visible: true,
	});
	console.log("new window", newWindow);

	await new Promise<void>((resolve, reject) => {
		newWindow.once("tauri://created", () => {
			console.log("new window created");
			resolve();
		});
		newWindow.once("tauri://error", (event) => reject(event.payload));
	});

	const enabled = await newWindow.isEnabled();
	console.log("new window enabled", enabled);
	return newWindow;
}
