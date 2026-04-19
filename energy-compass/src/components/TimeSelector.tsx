import { useEffect } from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Select from "@radix-ui/react-select";
import { useTime } from "@/contexts/TimeContext";
import { useSeason } from "@/contexts/SeasonContext";
import { MONTH_DEFAULTS } from "@/lib/constants";
import { format } from "date-fns";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const TimeSelector = () => {
  const { hour, day, month, year, setHour, setDay, setMonth, setYear } = useTime();
  const { setSeasonProgress } = useSeason();

  // Sync month → season bar position (representative)
  useEffect(() => {
    // Month-driven: map month [1..12] to a smooth progress
    // Jan=Winter(0.0), Apr=Spring(0.25), Jul=Summer(0.5), Oct=Autumn(0.75)
    const p = ((month - 1) / 12);
    setSeasonProgress(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const dateValid = (() => {
    try {
      const d = new Date(year, month - 1, day, hour);
      return d;
    } catch { return null; }
  })();

  const previewLabel = dateValid
    ? `📅 ${format(dateValid, "EEEE, d LLL yyyy")} — ${String(hour).padStart(2,"0")}:00`
    : "📅 —";

  return (
    <div className="flex flex-col items-center gap-1 w-full max-w-3xl">
      <div className="flex items-center gap-4 flex-wrap justify-center">
        {/* Hour */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-wider text-white/50">Hour</label>
          <Slider.Root
            className="relative flex items-center select-none touch-none w-32 h-5"
            value={[hour]} min={0} max={23} step={1}
            onValueChange={(v) => setHour(v[0])}
          >
            <Slider.Track className="bg-white/10 relative grow rounded-full h-1">
              <Slider.Range className="absolute rounded-full h-full" style={{background:"#00f5ff"}} />
            </Slider.Track>
            <Slider.Thumb
              className="block w-4 h-4 rounded-full bg-[#00f5ff] cursor-pointer"
              style={{ boxShadow: "0 0 12px #00f5ff" }}
              aria-label="Hour"
            />
          </Slider.Root>
          <span className="font-mono text-energy text-xs w-16 text-right">
            {String(hour).padStart(2,"0")}:00 {hour < 12 ? "AM" : "PM"}
          </span>
        </div>

        {/* Day */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] uppercase tracking-wider text-white/50">Day</label>
          <button
            onClick={() => setDay(Math.max(1, day - 1))}
            className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
          >−</button>
          <input
            type="number" min={1} max={31} value={day}
            onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
            className="w-12 h-7 bg-white/5 border border-white/10 rounded-md text-center font-mono text-energy text-sm"
          />
          <button
            onClick={() => setDay(Math.min(31, day + 1))}
            className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
          >+</button>
        </div>

        {/* Month */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] uppercase tracking-wider text-white/50">Month</label>
          <Select.Root value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <Select.Trigger className="h-7 px-2 bg-white/5 border border-white/10 rounded-md text-xs font-mono text-energy flex items-center gap-1 min-w-[100px]">
              <Select.Value />
              <Select.Icon className="text-white/40">▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-[#0a0f1e] border border-white/10 rounded-lg shadow-xl z-[100] backdrop-blur-xl">
                <Select.Viewport className="p-1">
                  {MONTHS.map((m, i) => (
                    <Select.Item
                      key={m} value={String(i+1)}
                      className="px-3 py-1.5 text-xs font-mono text-white/80 rounded hover:bg-white/10 cursor-pointer outline-none data-[state=checked]:text-energy"
                    >
                      <Select.ItemText>{m}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        {/* Year */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] uppercase tracking-wider text-white/50">Year</label>
          <input
            type="number" min={2016} max={2017} value={year}
            onChange={(e) => setYear(Number(e.target.value) || 2017)}
            className="w-16 h-7 bg-white/5 border border-white/10 rounded-md text-center font-mono text-energy text-sm"
          />
        </div>
      </div>

      <div className="text-[11px] font-mono text-solar mt-0.5">{previewLabel}</div>
    </div>
  );
};

// Helper for building default weather/solar from current month
export const monthDefaults = (month: number) => MONTH_DEFAULTS[month] ?? MONTH_DEFAULTS[6];
