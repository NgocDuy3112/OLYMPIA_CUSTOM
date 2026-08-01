import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

type MatchCodeOptions = {
    defaultPath: string;
    defaultCode?: string;
};

export const useMatchCode = ({ defaultPath, defaultCode }: MatchCodeOptions) => {
    const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
    const location = useLocation();
    const [matchCode, setMatchCode] = useState(() => localStorage.getItem("matchCode")?.trim() || "");

    useEffect(() => {
        if (urlMatchCode && urlMatchCode !== matchCode) {
            localStorage.setItem("matchCode", urlMatchCode);
            setMatchCode(urlMatchCode);
        }
    }, [urlMatchCode, matchCode]);

    useEffect(() => {
        if (matchCode) return;
        const onMatchCodeSet = () => {
            const storedCode = localStorage.getItem("matchCode")?.trim() || "";
            if (storedCode) setMatchCode(storedCode);
        };
        window.addEventListener("oc3_matchCode_set", onMatchCodeSet);
        return () => window.removeEventListener("oc3_matchCode_set", onMatchCodeSet);
    }, [matchCode]);

    useEffect(() => {
        if (!matchCode && defaultCode && location.pathname.startsWith(defaultPath)) {
            localStorage.setItem("matchCode", defaultCode);
            setMatchCode(defaultCode);
        }
    }, [defaultCode, defaultPath, location.pathname, matchCode]);

    return matchCode;
};
