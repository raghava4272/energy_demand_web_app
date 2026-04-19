import { useRef, useEffect, useCallback } from "react";
import { useSeason } from "@/contexts/SeasonContext";
import { seasonFromProgress, seasonEmoji, SEASON_BANDS, ALL_SITES } from "@/lib/constants";

const TRACK_GRADIENT =
  "linear-gradient(90deg, #1e3a5f 0%, #4a90d9 16%, #81C784 33%, #FFD54F 50%, #FF8A65 66%, #CE93D8 83%, #1e3a5f 100%)";

// Position each US site within its band (0..1)
const US_SITE_POSITIONS: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  const bands: Array<[number, number, readonly string[]]> = [
    [0.0, 0.25, SEASON_BANDS.Winter],
    [0.25, 0.5, SEASON_BANDS.Spring],
    [0.5, 0.75, SEASON_BANDS.Summer],
    [0.75, 1.0, SEASON_BANDS.Autumn],
  ];
  bands.forEach(([s, e, list]) => {
    list.forEach((site, i) => {
      const step = (e - s) / (list.length + 1);
      out[site] = s + step * (i + 1);
    });
  });
  return out;
})();

export const SeasonBar = () => {
  const { seasonProgress, setSeasonProgress, colorMode, setColorMode } = useSeason();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const season = seasonFromProgress(seasonProgress);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setSeasonProgress(p);
  }, [setSeasonProgress]);

  useEffect(() => {
    const move = (e: MouseEvent) => { if (draggingRef.current) updateFromClientX(e.clientX); };
    const up = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [updateFromClientX]);

  return (
    <div className="fixed left-0 right-0 bottom-8 h-16 z-40 px-4 py-1
      bg-white/5 backdrop-blur-xl border-t border-white/10 flex items-center gap-3">

      {/* Site rows + track */}
      <div className="flex-1 relative h-full flex flex-col justify-center">
        {/* US site markers row above track */}
        <div className="relative h-3 mb-0.5">
          <div className="absolute left-0 top-0 text-[9px] text-white/40 font-mono">🇺🇸 US</div>
          {ALL_SITES.filter(s => s !== "Cockatoo").map((s) => {
            const pos = US_SITE_POSITIONS[s];
            if (pos === undefined) return null;
            return (
              <div key={s}
                className="absolute -translate-x-1/2 text-[9px] font-mono text-white/60 whitespace-nowrap"
                style={{ left: `${pos * 100}%`, top: 0 }}
                title={s}
              >
                <span className="block w-1 h-1 mx-auto rounded-full bg-white/60" />
                <span className="hidden xl:inline">{s}</span>
              </div>
            );
          })}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className="relative h-3 rounded-full cursor-pointer overflow-visible"
          style={{ background: TRACK_GRADIENT, boxShadow: "0 0 16px rgba(0,0,0,0.6) inset" }}
          onMouseDown={(e) => { draggingRef.current = true; updateFromClientX(e.clientX); }}
        >
          {/* Thumb */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/4 w-8 h-8 rounded-full
              bg-white/10 backdrop-blur-md border-2 border-white flex items-center justify-center text-base
              cursor-grab active:cursor-grabbing select-none"
            style={{ left: `${seasonProgress * 100}%`, top: "-8px",
              boxShadow: "0 0 14px rgba(255,255,255,0.5)" }}
          >
            {seasonEmoji(season)}
          </div>
        </div>

        {/* Other / labels row */}
        <div className="relative h-4 mt-1">
          <div className="absolute left-0 top-0 text-[9px] text-white/40 font-mono">🌍 Other</div>
          <div className="absolute -translate-x-1/2 text-[9px] font-mono text-white/60"
               style={{ left: "25%", top: 0 }} title="Flamingo (London, UK)">
            <span className="block w-1 h-1 mx-auto rounded-full bg-white/60" />
            <span>Flamingo</span>
          </div>
          <div className="absolute -translate-x-1/2 text-[9px] font-mono text-white/60"
               style={{ left: "75%", top: 0 }} title="Cockatoo (Sydney, AU) — Southern Hemisphere (↕ inverted)">
            <span className="block w-1 h-1 mx-auto rounded-full bg-white/60" />
            <span>Cockatoo (↕)</span>
          </div>

          {/* Season labels */}
          <div className="absolute inset-x-0 top-0 flex justify-between px-2 pointer-events-none">
            <span className={`text-[10px] font-mono ${season==="Winter"?"text-white":"text-white/40"}`}>❄️ WINTER</span>
            <span className={`text-[10px] font-mono ${season==="Spring"?"text-white":"text-white/40"}`}>🌱 SPRING</span>
            <span className={`text-[10px] font-mono ${season==="Summer"?"text-white":"text-white/40"}`}>☀️ SUMMER</span>
            <span className={`text-[10px] font-mono ${season==="Autumn"?"text-white":"text-white/40"}`}>🍂 AUTUMN</span>
          </div>
        </div>
      </div>

      {/* Color mode pill */}
      <button
        onClick={() => setColorMode(colorMode === "solar" ? "usage" : "solar")}
        className="shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono
                   hover:bg-white/10 transition flex items-center gap-2"
        title="Toggle marker color mode"
      >
        🎨 <span className={colorMode==="solar"?"text-energy":"text-white/40"}>Solar Season</span>
        <span className="text-white/20">|</span>
        <span className={colorMode==="usage"?"text-energy":"text-white/40"}>Usage Type</span>
      </button>
    </div>
  );
};
