import type { InputHTMLAttributes } from "react";

type InputFieldProps = {
    label: string;
} & InputHTMLAttributes<HTMLInputElement>;

export const InputField = ({ label, ...props }: InputFieldProps) => (
    <div>
        <label className="block mb-1 font-medium text-sm">{label}</label>
        <input
            {...props}
            className="w-full px-3 py-2 rounded bg-white text-black border border-(--oc-border) focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
    </div>
);