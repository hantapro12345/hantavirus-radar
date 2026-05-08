export type SignalStatus = "confirmed" | "monitoring" | "suspected";

export type HantavirusSignal = {
  id: number;
  country: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  cases: number;
  deaths: number;
  status: SignalStatus;
  source: string;
  lastUpdate: string;
  summary: string;
};

export type TrackedCity = {
  id: number;
  country: string;
  city: string;
  lat: number;
  lng: number;
};

export const trackedCities: TrackedCity[] = [
  { id: 1, country: "Argentina", city: "Ushuaia", lat: -54.8019, lng: -68.3030 },
  { id: 2, country: "Argentina", city: "Buenos Aires", lat: -34.6037, lng: -58.3816 },
  { id: 3, country: "Argentina", city: "Bariloche", lat: -41.1335, lng: -71.3103 },
  { id: 4, country: "Chile", city: "Punta Arenas", lat: -53.1638, lng: -70.9171 },
  { id: 5, country: "Chile", city: "Temuco", lat: -38.7359, lng: -72.5904 },
  { id: 6, country: "Bolivia", city: "Santa Cruz", lat: -17.7833, lng: -63.1821 },
  { id: 7, country: "Brazil", city: "São Paulo", lat: -23.5505, lng: -46.6333 },
  { id: 8, country: "Paraguay", city: "Asunción", lat: -25.2637, lng: -57.5759 },
  { id: 9, country: "Uruguay", city: "Montevideo", lat: -34.9011, lng: -56.1645 },
  { id: 10, country: "Peru", city: "Lima", lat: -12.0464, lng: -77.0428 },
  { id: 11, country: "United States", city: "Albuquerque", lat: 35.0844, lng: -106.6504 },
  { id: 12, country: "Canada", city: "Vancouver", lat: 49.2827, lng: -123.1207 },
];

export const hantavirusSignals: HantavirusSignal[] = [
  {
    id: 1,
    country: "Argentina",
    city: "Ushuaia",
    region: "Tierra del Fuego",
    lat: -54.8019,
    lng: -68.3030,
    cases: 1,
    deaths: 0,
    status: "monitoring",
    source:
      "Africa CDC - statement on multi-country hantavirus cluster associated with cruise ship travel",
    lastUpdate: "2026-05-07",
    summary:
      "Verified public-health statement: a multi-country hantavirus cluster is being monitored in relation to cruise ship travel. Departure point included Ushuaia, Argentina. This does not mean the whole country is widely infected.",
  },
];

export const hantavirusStats = {
  activeSignals: hantavirusSignals.length,
  countries: new Set(hantavirusSignals.map((signal) => signal.country)).size,
  cities: hantavirusSignals.length,
  totalCases: hantavirusSignals.reduce((sum, signal) => sum + signal.cases, 0),
  totalDeaths: hantavirusSignals.reduce((sum, signal) => sum + signal.deaths, 0),
  lastUpdate: "2026-05-07",
};

export const symptoms = [
  "Fever",
  "Fatigue",
  "Muscle aches",
  "Headache",
  "Dizziness",
  "Chills",
  "Nausea, vomiting, diarrhea or abdominal pain",
  "Coughing and shortness of breath in severe cases",
];

export const prevention = [
  "Avoid contact with wild rodents.",
  "Do not sweep or vacuum rodent droppings dry.",
  "Ventilate enclosed spaces before cleaning.",
  "Use gloves and disinfect contaminated areas.",
  "Seal holes and gaps where rodents can enter.",
  "Store food in sealed containers.",
  "Remove nesting materials around homes, cabins and storage areas.",
];