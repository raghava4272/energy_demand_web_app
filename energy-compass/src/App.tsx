import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { TimeProvider } from "@/contexts/TimeContext";
import { BuildingProvider } from "@/contexts/BuildingContext";
import { SeasonProvider } from "@/contexts/SeasonContext";
import { PredictionProvider } from "@/contexts/PredictionContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="bottom-right" theme="dark" duration={4000} />
      <TimeProvider>
        <SeasonProvider>
          <BuildingProvider>
            <PredictionProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </PredictionProvider>
          </BuildingProvider>
        </SeasonProvider>
      </TimeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
