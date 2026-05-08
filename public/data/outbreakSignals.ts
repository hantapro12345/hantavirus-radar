export type SignalStatus = "confirmed" | "monitoring" | "suspected" | "none";

export type OutbreakSignal = {
  id: number;
  city: string;
  country: string;
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

export type CountrySignal = {
  country: string;
  cases: number;
  deaths: number;
  cities: string[];
  status: SignalStatus;
  source: string;
  summary: string;
};

export const officialSourceWatchlist = [
  {
    name: "WHO Disease Outbreak News",
    url: "https://www.who.int/emergencies/disease-outbreak-news",
  },
  {
    name: "ECDC Hantavirus updates",
    url: "https://www.ecdc.europa.eu/en/hantavirus-infection",
  },
  {
    name: "National public health authorities",
    url: "Country-specific health ministry / public health agency statements",
  },
];

export const outbreakSignals: OutbreakSignal[] = [
  {
    id: 1,
    city: "Ushuaia",
    country: "Argentina",
    region: "Tierra del Fuego / Patagonia exposure area",
    lat: -54.8019,
    lng: -68.303,
    cases: 1,
    deaths: 0,
    status: "monitoring",
    source:
      "WHO / ECDC - suspected exposure area linked to MV Hondius cruise cluster",
    lastUpdate: "2026-05-07",
    summary:
      "Argentina is shown because WHO/ECDC reports that the current hypothesis is exposure to Andes virus during time spent in Argentina before embarkation. This does not mean the whole country is widely infected.",
  },
  {
    id: 2,
    city: "Johannesburg",
    country: "South Africa",
    region: "Gauteng",
    lat: -26.2041,
    lng: 28.0473,
    cases: 2,
    deaths: 1,
    status: "confirmed",
    source:
      "WHO / ECDC - cases medically evacuated or diagnosed after travel to South Africa",
    lastUpdate: "2026-05-07",
    summary:
      "South Africa is shown because WHO/ECDC reports confirmed hantavirus / Andes virus cases connected with passengers medically evacuated or arriving there after the cruise.",
  },
  {
    id: 3,
    city: "Zurich",
    country: "Switzerland",
    region: "Zurich",
    lat: 47.3769,
    lng: 8.5417,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source:
      "WHO / ECDC - confirmed case diagnosed after return to Switzerland",
    lastUpdate: "2026-05-07",
    summary:
      "Switzerland is shown because WHO/ECDC reports an additional passenger diagnosed with hantavirus / Andes virus after returning to Switzerland.",
  },
  {
    id: 4,
    city: "Praia",
    country: "Cabo Verde",
    region: "Santiago Island",
    lat: 14.933,
    lng: -23.5133,
    cases: 2,
    deaths: 0,
    status: "suspected",
    source:
      "WHO / ECDC - symptomatic people remained on board while ship was moored in Cabo Verde",
    lastUpdate: "2026-05-07",
    summary:
      "Cabo Verde is shown as suspected/monitoring because WHO/ECDC reported symptomatic people still on board while the ship was moored there. These are not counted as confirmed country infections unless official testing confirms them.",
  },
];

export function getCountrySignals(): CountrySignal[] {
  const countryMap = new Map<string, CountrySignal>();

  for (const signal of outbreakSignals) {
    const existing = countryMap.get(signal.country);

    if (!existing) {
      countryMap.set(signal.country, {
        country: signal.country,
        cases: signal.cases,
        deaths: signal.deaths,
        cities: [signal.city],
        status: signal.status,
        source: signal.source,
        summary: signal.summary,
      });
    } else {
      existing.cases += signal.cases;
      existing.deaths += signal.deaths;

      if (!existing.cities.includes(signal.city)) {
        existing.cities.push(signal.city);
      }

      if (signal.status === "confirmed") {
        existing.status = "confirmed";
      } else if (
        signal.status === "monitoring" &&
        existing.status !== "confirmed"
      ) {
        existing.status = "monitoring";
      }
    }
  }

  return Array.from(countryMap.values());
}

export function getGlobalStats() {
  const countrySignals = getCountrySignals();

  return {
    activeSignals: outbreakSignals.filter((signal) => signal.cases > 0).length,
    countries: countrySignals.length,
    totalCases: outbreakSignals.reduce((sum, signal) => sum + signal.cases, 0),
    totalDeaths: outbreakSignals.reduce((sum, signal) => sum + signal.deaths, 0),
    trackedCities: outbreakSignals.length,
  };
}