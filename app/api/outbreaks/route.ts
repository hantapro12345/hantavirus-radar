import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

type OutbreakSignalRow = {
  id: number;
  disease: string;
  city: string;
  country: string;
  region: string | null;
  lat: number;
  lng: number;
  cases: number;
  deaths: number;
  status: "confirmed" | "monitoring" | "suspected" | "none";
  source_name: string | null;
  source_url: string | null;
  summary: string | null;
  last_update: string;
  created_at: string;
};

type CountrySignal = {
  country: string;
  cases: number;
  deaths: number;
  cities: string[];
  status: "confirmed" | "monitoring" | "suspected" | "none";
  source: string;
  summary: string;
};

function getStrongestStatus(
  current: CountrySignal["status"],
  next: CountrySignal["status"]
) {
  const order = {
    none: 0,
    suspected: 1,
    monitoring: 2,
    confirmed: 3,
  };

  return order[next] > order[current] ? next : current;
}

export async function GET() {
  const { data, error } = await supabase
    .from("outbreak_signals")
    .select("*")
    .eq("disease", "hantavirus")
    .gt("cases", 0)
    .order("last_update", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        disease: "hantavirus",
        message: "Could not load outbreak signals from Supabase.",
        error: error.message,
        stats: {
          activeSignals: 0,
          countries: 0,
          trackedCities: 0,
          totalCases: 0,
          totalDeaths: 0,
        },
        citySignals: [],
        countrySignals: [],
        officialSourceWatchlist: [],
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  const rows = (data || []) as OutbreakSignalRow[];

  const citySignals = rows.map((row) => ({
    id: row.id,
    city: row.city,
    country: row.country,
    region: row.region || "",
    lat: row.lat,
    lng: row.lng,
    cases: row.cases,
    deaths: row.deaths,
    status: row.status,
    source: row.source_name || "Verified public-health source",
    sourceUrl: row.source_url || "",
    lastUpdate: row.last_update,
    summary:
      row.summary ||
      "Verified hantavirus signal stored in the app database.",
  }));

  const countryMap = new Map<string, CountrySignal>();

  for (const row of rows) {
    const existing = countryMap.get(row.country);

    if (!existing) {
      countryMap.set(row.country, {
        country: row.country,
        cases: row.cases,
        deaths: row.deaths,
        cities: [row.city],
        status: row.status,
        source: row.source_name || "Verified public-health source",
        summary:
          row.summary ||
          "This country has at least one verified hantavirus case stored in the app database.",
      });
    } else {
      existing.cases += row.cases;
      existing.deaths += row.deaths;

      if (!existing.cities.includes(row.city)) {
        existing.cities.push(row.city);
      }

      existing.status = getStrongestStatus(existing.status, row.status);

      countryMap.set(row.country, existing);
    }
  }

  const countrySignals = Array.from(countryMap.values());

  const stats = {
    activeSignals: citySignals.length,
    countries: countrySignals.length,
    trackedCities: citySignals.length,
    totalCases: citySignals.reduce((sum, city) => sum + city.cases, 0),
    totalDeaths: citySignals.reduce((sum, city) => sum + city.deaths, 0),
  };

  return NextResponse.json({
    ok: true,
    disease: "hantavirus",
    mode: "supabase-live",
    message:
      "This API returns verified hantavirus signals loaded from Supabase.",
    stats,
    citySignals,
    countrySignals,
    officialSourceWatchlist: [
      "WHO",
      "ECDC",
      "CDC",
      "National health ministries",
      "Verified public-health reports",
    ],
    generatedAt: new Date().toISOString(),
  });
}