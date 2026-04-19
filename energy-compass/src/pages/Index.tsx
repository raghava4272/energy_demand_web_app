import { useRef, useCallback } from "react";
import { useBuildings } from "@/contexts/BuildingContext";
import { useTime } from "@/contexts/TimeContext";
import { Globe } from "@/components/Globe";
import { SidePanel } from "@/components/SidePanel";
import { SeasonBar } from "@/components/SeasonBar";
import { TimeSelector } from "@/components/TimeSelector";
import { BackendStatus } from "@/components/BackendStatus";
import { format } from "date-fns";

const Index = () => {
  const { selectedBuilding, buildingsList } = useBuildings();
  const { hour, day, month, year } = useTime();
  const panelScrollRef = useRef<HTMLDivElement>(null);

  let dateLabel = "—";
  try {
    const d = new Date(year, month - 1, day, hour);
    dateLabel = `${format(d, "yyyy-MM-dd")} ${String(hour).padStart(2,"0")}:00`;
  } catch {}

  // When a building is selected from the map, scroll the side panel to top
  const handleBuildingSelect = useCallback(() => {
    setTimeout(() => {
      panelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden text-white">
      <div className="starfield" />

      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-white/5 backdrop-blur-xl border-b border-white/10
        px-4 flex items-center justify-between gap-4">
        <h1 className="font-mono text-energy text-sm md:text-base whitespace-nowrap"
            style={{ textShadow: "0 0 12px rgba(0,245,255,0.5)" }}>
          ⚡ EnergyOracle
        </h1>
        <div className="flex-1 flex justify-center">
          <TimeSelector />
        </div>
        <BackendStatus />
      </header>

      {/* Main */}
      <main className="absolute top-14 bottom-24 left-0 right-0 flex">
        <section className="w-[65%] h-full p-2 pr-1">
          <div className="w-full h-full glass overflow-hidden relative">
            <Globe onBuildingSelect={handleBuildingSelect} />
          </div>
        </section>
        <aside className="w-[35%] h-full p-2 pl-1">
          <div
            ref={panelScrollRef}
            className="w-full h-full glass overflow-y-auto overflow-x-hidden"
          >
            <SidePanel />
          </div>
        </aside>
      </main>

      {/* Season bar */}
      <SeasonBar />

      {/* Bottom bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-8 z-50 bg-white/5 backdrop-blur-xl border-t border-white/10
        px-4 flex items-center justify-between text-[11px] font-mono text-white/60">
        <span className="truncate">
          {selectedBuilding ? <span className="text-energy">{selectedBuilding.building_id}</span> : "No building selected"}
        </span>
        <span className="hidden md:inline">{dateLabel}</span>
        <span>{buildingsList.length.toLocaleString()} buildings · 18 sites</span>
      </footer>
    </div>
  );
};

export default Index;
