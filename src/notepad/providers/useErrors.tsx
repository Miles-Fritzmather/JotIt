import React, { useContext, useMemo, useState } from "react";

import { createContext } from "react";

type ErrorsContextType = {
	error: string | null;
	cleanError: string | null;
	setError: (error: string | null) => void;
};

const ErrorsContext = createContext<ErrorsContextType | null>(null);

const ErrorsProvider = ({ children }: { children: React.ReactNode }) => {
	const [error, setError] = useState<string | null>(null);

	const cleanError = useMemo(() => {
		if (!error) return null;
		const [, message] = error.split(" --- ", 2);
		return message ?? error;
	}, [error]);

	return (
		<ErrorsContext.Provider
			value={{
				error,
				cleanError,
				setError: (nextError) =>
					setError(
						nextError ? `${new Date().toISOString()} --- ${nextError}` : null,
					),
			}}
		>
			{children}
		</ErrorsContext.Provider>
	);
};

const useErrors = () => {
	const errors = useContext(ErrorsContext);
	if (!errors) {
		throw new Error("useErrors must be used within a ErrorsProvider");
	}
	return errors;
};

export { ErrorsProvider, useErrors };
