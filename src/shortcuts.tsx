import { createContext, ReactNode, useContext } from "react";

export type command = string;
export type Keybind = string;
const keybindsSource = (await fetch("/shortcuts.json").then((res) =>
	res.json(),
)) as Record<command, Keybind>;

export interface KeybindsContextType {
	shortcuts: string[];
}

export const KeybindsContext = createContext<KeybindsContextType | null>(null);

export const KeybindsContextProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	return (
		<KeybindsContext.Provider
			value={{ shortcuts: Object.values(keybindsSource) }}
		>
			{children}
		</KeybindsContext.Provider>
	);
};

export function useKeybindsContext(): KeybindsContextType {
	const context = useContext(KeybindsContext);
	if (!context) {
		throw new Error(
			"KeybindsutsContext must be used within a KeybindsContextProvider",
		);
	}
	return context;
}
