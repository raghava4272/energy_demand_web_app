import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { runCombinedPrediction, PredictionResult, WeatherInput, SolarInput } from "@/lib/api";
import { toast } from "sonner";

type State = {
  prediction: PredictionResult | null;
  isLoading: boolean;
  error: string | null;
  runPrediction: (
    buildingId: string,
    time: { hour: number; day: number; month: number; year: number },
    weather: WeatherInput,
    solar: SolarInput,
  ) => Promise<void>;
  reset: () => void;
};

const Ctx = createContext<State | null>(null);

export const PredictionProvider = ({ children }: { children: ReactNode }) => {
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPrediction = useCallback(async (id: string, time: { hour: number; day: number; month: number; year: number }, weather: WeatherInput, solar: SolarInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await runCombinedPrediction({ building_id: id, ...time, weather, solar });
      setPrediction(res);
    } catch (e: any) {
      const status = e?.response?.status;
      const isTimeout = e?.code === "ECONNABORTED" || e?.message?.includes("timeout");
      let msg = "Prediction failed";
      if (isTimeout) msg = "Request timed out — backend is processing, try again";
      else if (!e?.response) msg = "Cannot reach backend — is uvicorn running on port 8000?";
      else if (status === 404) msg = "Building not found";
      else if (status === 422) msg = "Invalid input — check value ranges";
      else if (status === 500) msg = "Server error — check backend logs";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = () => { setPrediction(null); setError(null); };

  return (
    <Ctx.Provider value={{ prediction, isLoading, error, runPrediction, reset }}>
      {children}
    </Ctx.Provider>
  );
};

export const usePrediction = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrediction outside provider");
  return c;
};
