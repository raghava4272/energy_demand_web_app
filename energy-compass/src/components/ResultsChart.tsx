import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { PredictionResult } from "@/lib/api";

export const ResultsChart = ({ result }: { result: PredictionResult }) => {
  const data = [
    { name: "XGBoost",  value: result.energy.xgb_prediction ?? 0,      color: "#64B5F6" },
    { name: "ANN",      value: result.energy.ann_prediction ?? 0,       color: "#CE93D8" },
    { name: "Fusion",   value: result.energy.fusion_prediction ?? 0,    color: "#00f5ff" },
    { name: "Bayesian", value: result.energy.bayesian_prediction ?? 0,  color: "#FFB74D" },
    { name: "Solar",    value: result.solar.solar_output_kwh ?? 0,      color: "#FFB700" },
  ];

  return (
    <div className="w-full h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#ffffff10" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={false} tickLine={false}
            label={{ value: "kWh", position: "insideTopLeft", fill: "#94a3b8", fontSize: 10, dy: -6 }}
          />
          <Tooltip
            cursor={{ fill: "#ffffff08" }}
            contentStyle={{
              background: "rgba(10,15,30,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              fontFamily: "JetBrains Mono",
              fontSize: 12,
              color: "#e2e8f0",
            }}
            formatter={(v: any) => [`${Number(v).toFixed(2)} kWh`, "Prediction"]}
          />
          <ReferenceLine
            y={result.net_consumption_kwh}
            stroke="#10b981" strokeDasharray="4 4"
            label={{ value: "Net", fill: "#10b981", fontSize: 10, position: "right" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
