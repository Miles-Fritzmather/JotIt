import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const FLOATING_WINDOW = "floating-note";

async function configureOverlayWindow(window: WebviewWindow) {
	await invoke("configure_overlay_window", { label: window.label });
}

export async function closeFloatingWindow() {
	const existing = await WebviewWindow.getByLabel(FLOATING_WINDOW);

	if (existing) {
		await existing.hide();
	}
	return null;
}

export async function openFloatingWindow() {
	const existing = await WebviewWindow.getByLabel(FLOATING_WINDOW);

	if (existing) {
		await existing.setAlwaysOnTop(true);
		await existing.setVisibleOnAllWorkspaces(true);
		await configureOverlayWindow(existing);
		await existing.show();
		await existing.setFocus();
		return existing;
	}

	const newWindow = new WebviewWindow(FLOATING_WINDOW, {
		url: "/floating-note",
		title: "Quick Note",
		width: 600,
		height: 500,
		x: 100,
		y: 100,
		alwaysOnTop: true,
		visibleOnAllWorkspaces: true,
		focus: false,
		visible: false,
	});

	await new Promise<void>((resolve, reject) => {
		newWindow.once("tauri://created", () => {
			resolve();
		});
		newWindow.once("tauri://error", (event) => reject(event.payload));
	});

	await configureOverlayWindow(newWindow);
	await newWindow.show();
	await newWindow.setFocus();

	return newWindow;
}

export async function toggleFloatingWindow() {
	const existing = await WebviewWindow.getByLabel(FLOATING_WINDOW);

	if (existing) {
		if (await existing.isVisible()) {
			return await closeFloatingWindow();
		}

		return await openFloatingWindow();
	}

	return await openFloatingWindow();
}
