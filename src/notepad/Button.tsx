import React, { forwardRef } from "react";

const Button = ({
	children,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return (
		<button
			className="rounded-md bg-accent/90 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent"
			{...props}
		>
			{children}
		</button>
	);
};

const IconButton = forwardRef<
	HTMLButtonElement,
	React.ButtonHTMLAttributes<HTMLButtonElement> & {
		icon: React.ReactNode;
	}
>(({ icon, ...props }, ref) => {
	return (
		<button
			ref={ref}
			className="h-7 w-7 rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white/90 flex items-center justify-center"
			{...props}
		>
			{icon}
		</button>
	);
});
IconButton.displayName = "IconButton";

export { Button, IconButton };
