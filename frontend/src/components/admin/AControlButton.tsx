import type { ButtonHTMLAttributes } from "react";

interface AControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
}

export default function AControlButton({ children, className, ...props }: AControlButtonProps) {
	return (
		<button
			className={`bg-blue-900 ring-blue-600 ring-3 rounded-none min-w-24 h-9 tablet:min-w-28 tablet:h-10 xl:min-w-40 xl:h-15 text-xs tablet:text-sm flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50${className ? ` ${className}` : ""}`}
			{...props}
		>
			{children}
		</button>
	);
}
