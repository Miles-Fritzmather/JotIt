import React, { useContext, useEffect, useState } from "react";

import { createContext } from "react";

const FocusContext = createContext<boolean>(true);

const FocusProvider = ({ children }: { children: React.ReactNode }) => {
	const [isFocused, setIsFocused] = useState(false);

	useEffect(() => {
		const handleFocus = () => {
			setIsFocused(true);
		};
		const handleBlur = () => {
			setIsFocused(false);
		};
		window.addEventListener("focus", handleFocus);
		window.addEventListener("blur", handleBlur);
		return () => {
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("blur", handleBlur);
		};
	}, []);
	return (
		<FocusContext.Provider value={isFocused}>{children}</FocusContext.Provider>
	);
};

const useFocus = () => {
	const isFocused = useContext(FocusContext);
	return isFocused;
};

export { FocusProvider, useFocus };
