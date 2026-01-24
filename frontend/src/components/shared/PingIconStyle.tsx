import React from "react";
import { Bell, KeyRound } from "lucide-react";

export const PingIconStyle: React.FC<{ isKeywordMode: boolean }> = ({ isKeywordMode }) => {
    return isKeywordMode ? (
        <KeyRound className="inline-block mr-2 mb-1" size={18} />
    ) : (
        <Bell className="inline-block mr-2 mb-1" size={18} />
    );
};

export default PingIconStyle;