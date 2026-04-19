export const USAGE_COLORS: Record<string, string> = {
  "Education": "#4FC3F7",
  "Entertainment/public assembly": "#FFB74D",
  "Food sales and service": "#81C784",
  "Healthcare": "#F06292",
  "Lodging/residential": "#CE93D8",
  "Manufacturing/industrial": "#FF8A65",
  "Office": "#64B5F6",
  "Other": "#90A4AE",
  "Parking": "#B0BEC5",
  "Public services": "#4DB6AC",
  "Religious worship": "#FFD54F",
  "Retail": "#E57373",
  "Services": "#AED581",
  "Technology/science": "#4DD0E1",
  "Utility": "#78909C",
  "Warehouse/storage": "#A1887F",
};

export const usageColor = (u: string) => USAGE_COLORS[u] || "#90A4AE";

export const SITE_COORDS: Record<string, [number, number]> = {
  Bear:     [37.871902,  -122.260727],
  Bobcat:   [40.0150,    -105.2705],    // parquet had ocean coord → Boulder, CO (US/Mountain)
  Bull:     [30.267200,  -97.743103],
  Cockatoo: [42.459835,  -76.485291],
  Crow:     [45.387600,  -75.695999],
  Eagle:    [38.9897,    -76.9378],     // parquet had ocean coord → College Park, MD (US/Eastern)
  Fox:      [33.424427,  -111.928139],
  Gator:    [29.6465,    -82.3533],     // parquet had ocean coord → Gainesville, FL ("Gator")
  Hog:      [44.978783,  -93.255394],
  Lamb:     [51.497837,  -3.186246],
  Moose:    [45.421501,  -75.697197],
  Mouse:    [51.521938,  -0.120069],
  Panther:  [28.517689,  -81.379036],
  Peacock:  [40.349998,  -74.699997],
  Rat:      [38.903503,  -77.005348],
  Robin:    [51.518791,  -0.134556],
  Shrew:    [51.499840,  -0.124663],
  Wolf:     [53.3498,    -6.2603],      // parquet had +6.26 (North Sea) → Dublin (Europe/Dublin)
};

export const ALL_SITES = [
  "Bear","Bobcat","Bull","Cockatoo","Crow","Eagle","Fox","Gator","Hog",
  "Lamb","Moose","Mouse","Panther","Peacock","Rat","Robin","Shrew","Wolf"
];

export const SITE_CITIES: Record<string, string> = {
  Bear:     "Berkeley, CA",
  Bobcat:   "Boulder, CO",
  Bull:     "Austin, TX",
  Cockatoo: "Ithaca, NY",
  Crow:     "Ottawa, ON",
  Eagle:    "College Park, MD",
  Fox:      "Tempe, AZ",
  Gator:    "Gainesville, FL",
  Hog:      "Minneapolis, MN",
  Lamb:     "Cardiff, Wales",
  Moose:    "Ottawa, ON",
  Mouse:    "London, UK",
  Panther:  "Orlando, FL",
  Peacock:  "Princeton, NJ",
  Rat:      "Washington, DC",
  Robin:    "London, UK",
  Shrew:    "London, UK",
  Wolf:     "Dublin, Ireland",
};

// Months → defaults
export const MONTH_DEFAULTS: Record<number, { temp:number; clouds:number; GHI:number; DNI:number; DHI:number }> = {
  1:{temp:2,clouds:5,GHI:200,DNI:150,DHI:60},
  2:{temp:4,clouds:5,GHI:280,DNI:200,DHI:80},
  3:{temp:9,clouds:4,GHI:400,DNI:300,DHI:100},
  4:{temp:14,clouds:4,GHI:520,DNI:380,DHI:120},
  5:{temp:19,clouds:3,GHI:620,DNI:480,DHI:130},
  6:{temp:24,clouds:2,GHI:750,DNI:580,DHI:140},
  7:{temp:27,clouds:2,GHI:800,DNI:620,DHI:140},
  8:{temp:26,clouds:2,GHI:720,DNI:560,DHI:130},
  9:{temp:21,clouds:3,GHI:560,DNI:420,DHI:120},
  10:{temp:15,clouds:4,GHI:380,DNI:280,DHI:100},
  11:{temp:8,clouds:5,GHI:220,DNI:160,DHI:70},
  12:{temp:3,clouds:6,GHI:170,DNI:120,DHI:55},
};

export const SEASON_SOLAR = {
  Winter: { GHI: 170, DNI: 120, DHI: 55 },
  Spring: { GHI: 480, DNI: 360, DHI: 110 },
  Summer: { GHI: 780, DNI: 600, DHI: 140 },
  Autumn: { GHI: 360, DNI: 260, DHI: 95 },
} as const;

export type Season = keyof typeof SEASON_SOLAR;

export const seasonFromProgress = (p: number): Season => {
  if (p < 0.25) return "Winter";
  if (p < 0.5) return "Spring";
  if (p < 0.75) return "Summer";
  return "Autumn";
};

export const seasonEmoji = (s: Season) => ({Winter:"❄️",Spring:"🌱",Summer:"☀️",Autumn:"🍂"} as const)[s];

// Hex color interpolation
function hexToRgb(hex: string) {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r:number,g:number,b:number) {
  const c = (n:number)=>Math.round(n).toString(16).padStart(2,"0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function lerp(a:number,b:number,t:number){ return a+(b-a)*t; }
function lerpColor(a:string,b:string,t:number){
  const [r1,g1,b1]=hexToRgb(a); const [r2,g2,b2]=hexToRgb(b);
  return rgbToHex(lerp(r1,r2,t), lerp(g1,g2,t), lerp(b1,b2,t));
}

const SOLAR_STOPS: Array<[number,string]> = [
  [0.0, "#546E7A"], [0.375, "#FDD835"],
  [0.625, "#FFB700"], [0.875, "#FDD835"], [1.0, "#546E7A"],
];

export function interpolateSeasonColor(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < SOLAR_STOPS.length - 1; i++) {
    const [p1,c1] = SOLAR_STOPS[i];
    const [p2,c2] = SOLAR_STOPS[i+1];
    if (p >= p1 && p <= p2) {
      const t = (p - p1) / (p2 - p1 || 1);
      return lerpColor(c1, c2, t);
    }
  }
  return "#FFB700";
}

export function interpolateSeasonOpacity(progress: number): number {
  const stops: Array<[number,number]> = [[0,0.6],[0.375,0.8],[0.625,1.0],[0.875,0.8],[1,0.6]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p1,o1]=stops[i]; const [p2,o2]=stops[i+1];
    if (progress>=p1 && progress<=p2) {
      const t=(progress-p1)/(p2-p1||1); return o1+(o2-o1)*t;
    }
  }
  return 0.9;
}

export function interpolateSolar(progress: number): { GHI:number; DNI:number; DHI:number } {
  // 0=Winter,0.25=Spring,0.5=Summer,0.75=Autumn,1=Winter
  const stops = [
    [0.0, SEASON_SOLAR.Winter],
    [0.25, SEASON_SOLAR.Spring],
    [0.5, SEASON_SOLAR.Summer],
    [0.75, SEASON_SOLAR.Autumn],
    [1.0, SEASON_SOLAR.Winter],
  ] as const;
  for (let i=0;i<stops.length-1;i++){
    const [p1,a]=stops[i]; const [p2,b]=stops[i+1];
    if (progress>=p1 && progress<=p2){
      const t=(progress-p1)/(p2-p1||1);
      return {
        GHI: a.GHI+(b.GHI-a.GHI)*t,
        DNI: a.DNI+(b.DNI-a.DNI)*t,
        DHI: a.DHI+(b.DHI-a.DHI)*t,
      };
    }
  }
  return SEASON_SOLAR.Summer;
}

export const SEASON_BANDS = {
  Winter: ["Bear","Wolf","Moose","Crow"],
  Spring: ["Fox","Eagle","Shrew"],
  Summer: ["Bobcat","Gator","Bull","Robin","Panther"],
  Autumn: ["Rat","Lamb","Hog","Mouse","Peacock"],
} as const;

export const isNight = (h:number) => h<=5 || h>=20;
