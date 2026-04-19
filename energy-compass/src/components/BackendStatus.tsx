import { useEffect, useState } from "react";
import { ping } from "@/lib/api";

export const BackendStatus = () => {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = await ping();
      if (alive) setOnline(ok);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const color = online === null ? "#facc15" : online ? "#10b981" : "#ef4444";
  const label = online === null ? "Checking..." : online ? "Connected" : "Offline";
  const symbol = online ? "●" : "○";

  return (
    <div className="flex items-center gap-2 text-xs font-mono" title={`Backend ${label}`}>
      <span style={{ color, textShadow: `0 0 8px ${color}` }} className="text-base leading-none">{symbol}</span>
      <span className="text-white/70 hidden md:inline">{label}</span>
    </div>
  );
};
