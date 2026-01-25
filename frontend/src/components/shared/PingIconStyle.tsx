import React from "react";
import { Zap, KeyRound } from "lucide-react";



const PingIconStyle: React.FC<{ isKeywordMode: boolean }> = ({ isKeywordMode }) => {
    const defaultStyle = 'inline-block mr-2 mb-1';
    const defaultSize = 18;
    return isKeywordMode ? (
        <KeyRound className={defaultStyle} size={defaultSize} />
    ) : (
        <Zap className={defaultStyle} size={defaultSize} />
    );
};



export default PingIconStyle;