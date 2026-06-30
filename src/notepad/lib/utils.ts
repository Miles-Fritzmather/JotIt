import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function messageFromError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
