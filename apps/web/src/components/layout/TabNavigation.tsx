import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface Tab {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

interface TabNavigationProps {
  tabs: Tab[];
  basepath: string;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  basepath,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    const fullPath = `${basepath}${path}`;
    return location.pathname === fullPath || location.pathname === `${fullPath}/`;
  };

  return (
    <div className="border-b border-white/10">
      <div className="flex overflow-x-auto scrollbar-hide -mb-px">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(`${basepath}${tab.path}`)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors
                ${
                  active
                    ? "border-blue-500 text-white"
                    : "border-transparent text-gray-400 hover:text-white hover:border-white/20"
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
