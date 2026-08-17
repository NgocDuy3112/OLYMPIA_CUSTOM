import React from "react";

interface BaseAuthLayoutProps {
    title: string;
    subtitle: string;
    children: React.ReactNode;
}

export const BaseAuthLayout: React.FC<BaseAuthLayoutProps> = ({ title, subtitle, children }) => (
    <div className="flex flex-col justify-center items-center min-h-screen bg-cover bg-center p-4">
        <div className="card w-full max-w-sm sm:max-w-md">
            <div className="text-center mb-6">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-[SVN-Gratelos_Display] font-bold mb-2 uppercase">{title}</h1>
                <h2 className="text-base sm:text-lg md:text-xl font-bold opacity-90">{subtitle}</h2>
            </div>
            {children}
        </div>
    </div>
);
