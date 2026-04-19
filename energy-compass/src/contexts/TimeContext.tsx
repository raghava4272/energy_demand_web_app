import { createContext, useContext, useState, ReactNode } from "react";

type TimeState = {
  hour: number; day: number; month: number; year: number;
  setHour: (n:number)=>void; setDay:(n:number)=>void;
  setMonth:(n:number)=>void; setYear:(n:number)=>void;
};

const TimeCtx = createContext<TimeState | null>(null);

export const TimeProvider = ({ children }: { children: ReactNode }) => {
  const [hour,setHour]=useState(12);
  const [day,setDay]=useState(15);
  const [month,setMonth]=useState(6);
  const [year,setYear]=useState(2017);
  return <TimeCtx.Provider value={{hour,day,month,year,setHour,setDay,setMonth,setYear}}>{children}</TimeCtx.Provider>;
};

export const useTime = () => {
  const c = useContext(TimeCtx);
  if (!c) throw new Error("useTime outside provider");
  return c;
};
