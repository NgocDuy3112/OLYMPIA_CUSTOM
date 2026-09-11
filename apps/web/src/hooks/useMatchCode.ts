import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  getMatchCode as readStoredMatchCode,
  setMatchCode as writeStoredMatchCode,
} from "@/utils/storage";

type MatchCodeOptions = {
  defaultPath: string;
  defaultCode?: string;
};

export const useMatchCode = ({
  defaultPath,
  defaultCode,
}: MatchCodeOptions) => {
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const location = useLocation();
  const [matchCode, setMatchCode] = useState(
    () => readStoredMatchCode().trim(),
  );

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== matchCode) {
      writeStoredMatchCode(urlMatchCode);
      setMatchCode(urlMatchCode);
    }
  }, [urlMatchCode, matchCode]);

  useEffect(() => {
    if (matchCode) return;
    const onMatchCodeSet = () => {
      const storedCode = readStoredMatchCode().trim();
      if (storedCode) setMatchCode(storedCode);
    };
    window.addEventListener("oc3_matchCode_set", onMatchCodeSet);
    return () =>
      window.removeEventListener("oc3_matchCode_set", onMatchCodeSet);
  }, [matchCode]);

  useEffect(() => {
    if (
      !matchCode &&
      defaultCode &&
      location.pathname.startsWith(defaultPath)
    ) {
      writeStoredMatchCode(defaultCode);
      setMatchCode(defaultCode);
    }
  }, [defaultCode, defaultPath, location.pathname, matchCode]);

  return matchCode;
};
