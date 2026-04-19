import { createContext, useContext, useState, ReactNode } from "react";
import { Season, seasonFromProgress } from "@/lib/constants";

type ColorMode = "solar" | "usage";

type State = {
  season: Season; seasonProgress: number; colorMode: ColorMode;
  setSeasonProgress: (p: number) => void;
  setColorMode: (m: ColorMode) => void;
};

const Ctx = createContext<State | null>(null);

export const SeasonProvider = ({ children }: { children: ReactNode }) => {
  const [seasonProgress, setProgress] = useState(0.625);
  const [colorMode, setColorMode] = useState<ColorMode>("usage");
  const season = seasonFromProgress(seasonProgress);
  return <Ctx.Provider value={{
    season, seasonProgress, colorMode,
    setSeasonProgress: setProgress, setColorMode,
  }}>{children}</Ctx.Provider>;
};

export const useSeason = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSeason outside provider");
  return c;
};
