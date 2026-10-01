import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  // Base UI Tabs controlled — value = path tab đang active theo router.
  const activeTab = tabs.find((tab) => isActive(tab.path))?.path ?? tabs[0]?.path ?? "";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => navigate(`${basepath}${value}`)}
      className="w-full"
    >
      <TabsList
        variant="line"
        className="w-full h-auto justify-start gap-0 overflow-x-auto scrollbar-hide rounded-none border-b border-white/10 bg-transparent p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.path}
            value={tab.path}
            className="flex items-center gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-white data-[active=true]:border-blue-500 data-[active=true]:bg-transparent data-[active=true]:text-white data-[active=true]:shadow-none"
          >
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
