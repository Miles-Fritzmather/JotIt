export type ForcedPasteMode = "formatted" | "plain";

let pasteWithFormatting = true;
let forcedPasteMode: ForcedPasteMode | null = null;

export function setPasteWithFormatting(enabled: boolean) {
	pasteWithFormatting = enabled;
}

export function getPasteWithFormatting() {
	return pasteWithFormatting;
}

export function armOppositePasteMode() {
	forcedPasteMode = pasteWithFormatting ? "plain" : "formatted";
}

export function resolvePasteAsPlain(): boolean {
	if (forcedPasteMode === "plain") {
		forcedPasteMode = null;
		return true;
	}
	if (forcedPasteMode === "formatted") {
		forcedPasteMode = null;
		return false;
	}
	return !pasteWithFormatting;
}
