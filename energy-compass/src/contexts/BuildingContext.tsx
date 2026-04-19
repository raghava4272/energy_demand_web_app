import { createContext, useContext, useState, ReactNode } from "react";
import type { Building, BuildingDetail } from "@/lib/api";

type State = {
  buildingsList: Building[];
  setBuildingsList: (b: Building[]) => void;
  selectedBuilding: BuildingDetail | null;
  setSelectedBuilding: (b: BuildingDetail | null) => void;
  siteFilter: string | null;
  setSiteFilter: (s: string | null) => void;
  buildingStatsCache: Record<string, BuildingDetail>;
  cacheBuilding: (b: BuildingDetail) => void;
};

const Ctx = createContext<State | null>(null);

export const BuildingProvider = ({ children }: { children: ReactNode }) => {
  const [buildingsList, setBuildingsList] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingDetail | null>(null);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [buildingStatsCache, setCache] = useState<Record<string, BuildingDetail>>({});
  const cacheBuilding = (b: BuildingDetail) =>
    setCache(prev => ({ ...prev, [b.building_id]: b }));

  return <Ctx.Provider value={{
    buildingsList, setBuildingsList,
    selectedBuilding, setSelectedBuilding,
    siteFilter, setSiteFilter,
    buildingStatsCache, cacheBuilding,
  }}>{children}</Ctx.Provider>;
};

export const useBuildings = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBuildings outside provider");
  return c;
};
