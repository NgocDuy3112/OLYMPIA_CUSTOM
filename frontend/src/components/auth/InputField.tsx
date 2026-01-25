/* eslint-disable @typescript-eslint/no-explicit-any */

export const InputField = ({ label, ...props }: any) => (
    <div>
        <label className="block mb-1 font-medium text-sm">{label}</label>
        <input
            {...props}
            className="w-full px-3 py-2 rounded bg-white text-black border border-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
        />
    </div>
);