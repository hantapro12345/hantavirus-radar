import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MapEventStatus = "monitored" | "suspected" | "confirmed" | "death";

type PublicMapEventRow = {
  id: string;
  disease: string;
  pathogen: string;
  status: MapEventStatus;
  visibility: string;
  headline: string;
  summary: string | null;
  country: string;
  country_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  case_count: number;
  death_count: number;
  monitored_count: number;
  suspected_count: number;
  confirmed_count: number;
  event_date: string | null;
  reported_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  confidence_score: number;
  primary_source_url: string | null;
  primary_source_name: string | null;
  primary_source_type: string | null;
  source_count: number;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type CountrySignal = {
  country: string;
  countryCode: string;
  cases: number;
  confirmed: number;
  suspected: number;
  monitoring: number;
  deaths: number;
  cities: string[];
  status: MapEventStatus;
  source: string;
  sourceUrl: string;
  summary: string;
};

function getStrongestStatus(current: MapEventStatus, next: MapEventStatus) {
  const order: Record<MapEventStatus, number> = {
    monitored: 1,
    suspected: 2,
    confirmed: 3,
    death: 4,
  };

  return order[next] > order[current] ? next : current;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(row: PublicMapEventRow): MapEventStatus {
  if (normalizeNumber(row.death_count) > 0) {
    return "death";
  }

  if (
    row.status === "death" ||
    row.status === "confirmed" ||
    row.status === "suspected" ||
    row.status === "monitored"
  ) {
    return row.status;
  }

  return "monitored";
}

function buildCitySignals(rows: PublicMapEventRow[]) {
  return rows
    .map((row, index) => {
      const confirmed = normalizeNumber(row.confirmed_count);
      const suspected = normalizeNumber(row.suspected_count);
      const monitoring = normalizeNumber(row.monitored_count);
      const deaths = normalizeNumber(row.death_count);
      const cases = normalizeNumber(row.case_count) || confirmed;

      const status = normalizeStatus(row);

      return {
        id: index + 1,
        eventId: row.id,

        disease: row.disease,
        pathogen: row.pathogen,

        city: row.city || row.location_label || "Unknown city",
        country: row.country || "Unknown country",
        countryCode: row.country_code || "",
        region: row.region || "Unknown region",

        lat: Number(row.latitude),
        lng: Number(row.longitude),

        cases,
        confirmed,
        suspected,
        monitoring,
        deaths,

        status,

        headline: row.headline,
        source: row.primary_source_name || "Verified public-health source",
        sourceUrl: row.primary_source_url || "",
        sourceType: row.primary_source_type || "other",
        sourceCount: normalizeNumber(row.source_count),

        lastUpdate:
          row.reported_date ||
          row.event_date ||
          row.updated_at ||
          row.last_seen_at ||
          row.first_seen_at,

        eventDate: row.event_date,
        reportedDate: row.reported_date,

        confidenceScore: Number(row.confidence_score || 0),

        summary:
          row.summary ||
          row.headline ||
          "Verified hantavirus signal stored in the Hantavirus Radar database.",

        tags: row.tags || [],
      };
    })
    .filter((city) => {
      if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) {
        return false;
      }

      if (city.lat === 0 && city.lng === 0) {
        return false;
      }

      return true;
    });
}

function buildCountrySignals(citySignals: ReturnType<typeof buildCitySignals>) {
  const countryMap = new Map<string, CountrySignal>();

  for (const city of citySignals) {
    const key = city.country;

    const existing = countryMap.get(key);

    if (!existing) {
      countryMap.set(key, {
        country: city.country,
        countryCode: city.countryCode,
        cases: city.cases,
        confirmed: city.confirmed,
        suspected: city.suspected,
        monitoring: city.monitoring,
        deaths: city.deaths,
        cities: [city.city],
        status: city.status,
        source: city.source,
        sourceUrl: city.sourceUrl,
        summary:
          city.summary ||
          `${city.country} has at least one hantavirus signal stored in the database.`,
      });

      continue;
    }

    existing.cases += city.cases;
    existing.confirmed += city.confirmed;
    existing.suspected += city.suspected;
    existing.monitoring += city.monitoring;
    existing.deaths += city.deaths;

    if (!existing.cities.includes(city.city)) {
      existing.cities.push(city.city);
    }

    existing.status = getStrongestStatus(existing.status, city.status);

    if (city.sourceUrl && !existing.sourceUrl) {
      existing.sourceUrl = city.sourceUrl;
    }

    countryMap.set(key, existing);
  }

  return Array.from(countryMap.values()).sort((a, b) =>
    a.country.localeCompare(b.country)
  );
}

export async function GET() {
  const { data, error } = await supabase
    .from("public_map_events")
    .select("*")
    .eq("disease", "Hantavirus")
    .order("last_seen_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        disease: "hantavirus",
        mode: "supabase-public-map-events",
        message: "Could not load public map events from Supabase.",
        error: error.message,
        stats: {
          activeSignals: 0,
          countries: 0,
          trackedCities: 0,
          totalCases: 0,
          totalConfirmed: 0,
          totalSuspected: 0,
          totalMonitoring: 0,
          totalDeaths: 0,
        },
        citySignals: [],
        countrySignals: [],
        officialSourceWatchlist: [
          "WHO",
          "ECDC",
          "CDC",
          "PAHO",
          "National health ministries",
          "Regional public-health bulletins",
          "Verified public-health reports",
        ],
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  const rows = (data || []) as PublicMapEventRow[];

  const citySignals = buildCitySignals(rows);
  const countrySignals = buildCountrySignals(citySignals);

  const stats = {
    activeSignals: citySignals.length,
    countries: countrySignals.length,
    trackedCities: citySignals.length,

    totalCases: citySignals.reduce((sum, city) => sum + city.cases, 0),
    totalConfirmed: citySignals.reduce((sum, city) => sum + city.confirmed, 0),
    totalSuspected: citySignals.reduce((sum, city) => sum + city.suspected, 0),
    totalMonitoring: citySignals.reduce((sum, city) => sum + city.monitoring, 0),
    totalDeaths: citySignals.reduce((sum, city) => sum + city.deaths, 0),
  };

  return NextResponse.json({
    ok: true,
    disease: "hantavirus",
    mode: "supabase-public-map-events",
    message:
      "This API returns public Hantavirus Radar events from the clean Supabase public_map_events view.",
    stats,
    citySignals,
    countrySignals,
    officialSourceWatchlist: [
      "WHO",
      "ECDC",
      "CDC",
      "PAHO",
      "National health ministries",
      "Regional public-health bulletins",
      "Verified public-health reports",
    ],
    generatedAt: new Date().toISOString(),
  });
}