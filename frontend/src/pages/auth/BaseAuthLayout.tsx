import React from "react";


interface BaseAuthLayoutProps {
    title: string;
    subtitle: string;
    children: React.ReactNode;
}



export const BaseAuthLayout: React.FC<BaseAuthLayoutProps> = ({ title, subtitle, children }) => (
    <div className="flex flex-col justify-center items-center min-h-screen bg-cover bg-center text-white">
        <div className="bg-red-900 bg-opacity-50 p-10 rounded-xl shadow-lg w-full max-w-md backdrop-blur-sm">
            <div className="text-center mb-6">
                <h1 className="text-4xl font-[SVN-Gratelos_Display] font-bold mb-2 uppercase">{title}</h1>
                <h2 className="text-xl font-bold opacity-90">{subtitle}</h2>
            </div>
            {children}
        </div>
    </div>
);