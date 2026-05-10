import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SignalStatus = "confirmed" | "monitoring" | "suspected" | "none";

type OutbreakSignal = {
  disease: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  cases: number;
  deaths: number;
  status: SignalStatus;
  source_name: string;
  source_url: string;
  last_update: string;
  summary: string;
};

type Database = {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      outbreak_signals: {
        Row: OutbreakSignal & { id: string | number };
        Insert: OutbreakSignal;
        Update: Partial<OutbreakSignal>;
        Relationships: [];
      };
    };
  };
};

type SupabaseClient = ReturnType<typeof createClient<Database>>;

type Article = {
  title: string;
  url: string;
  sourceName: string;
};

type GeoResult = {
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCAN_SECRET =
  process.env.SCAN_SECRET || "hantavirus_radar_secret_123456789";

const GEOCODE_EMAIL = process.env.GEOCODE_EMAIL || "contact@hantavirusradar.com";

const MAX_ARTICLES_TO_PROCESS = 45;
const MAX_GEOCODE_REQUESTS = 10;
const GEOCODE_DELAY_MS = 900;

const blockedWords = [
  "simpsons",
  "prediction",
  "predictions",
  "predicted",
  "nostradamus",
  "time traveller",
  "time traveler",
  "psychic",
  "conspiracy",
  "horoscope",
  "joke",
  "meme",
  "fake",
  "rumor",
  "rumour",
];

const negativeWords = [
  "negative",
  "tests negative",
  "tested negative",
  "no risk",
  "low risk",
  "not infected",
  "false alarm",
  "ruled out",
  "hoax",
];

const healthWords = [
  "hantavirus",
  "andes virus",
  "andv",
  "case",
  "cases",
  "confirmed",
  "patient",
  "patients",
  "tested positive",
  "positive",
  "health",
  "public health",
  "outbreak",
  "infection",
  "infected",
  "hospital",
  "hospitalized",
  "hospitalised",
  "death",
  "deaths",
  "fatal",
  "virus",
  "disease",
  "cdc",
  "who",
  "ecdc",
  "ministry",
  "cruise",
  "ship",
  "passenger",
  "passengers",
  "travel",
];

const badLocationWords = [
  "hantavirus",
  "andes",
  "andv",
  "virus",
  "case",
  "cases",
  "outbreak",
  "health",
  "public",
  "hospital",
  "hospitalized",
  "hospitalised",
  "confirmed",
  "patient",
  "patients",
  "death",
  "deaths",
  "passenger",
  "passengers",
  "cruise",
  "ship",
  "after",
  "before",
  "with",
  "from",
  "near",
  "over",
  "under",
  "into",
  "during",
  "warning",
  "alert",
  "risk",
  "disease",
  "infection",
];

const manualCountryAliases: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  america: "United States",
  "united states of america": "United States",

  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",

  rpa: "South Africa",
  "south africa": "South Africa",

  holland: "Netherlands",
  "the netherlands": "Netherlands",

  "czech republic": "Czechia",
  russia: "Russia",
  "russian federation": "Russia",

  "south korea": "South Korea",
  "north korea": "North Korea",

  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",

  "dr congo": "Democratic Republic of the Congo",
  "drc": "Democratic Republic of the Congo",
  congo: "Republic of the Congo",

  "ivory coast": "Côte d’Ivoire",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, "").trim());
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as any).cause;

    if (cause?.message) {
      return `${error.message} | cause: ${cause.message}`;
    }

    if (cause?.code) {
      return `${error.message} | cause code: ${cause.code}`;
    }

    return error.message;
  }

  return String(error);
}

function containsAny(text: string, words: string[]) {
  const clean = normalizeText(text);
  return words.some((word) => clean.includes(normalizeText(word)));
}

function articleLooksRelevant(title: string, url: string) {
  const text = `${title} ${url}`;
  const clean = normalizeText(text);

  if (!clean.includes("hantavirus") && !clean.includes("andes virus")) {
    return false;
  }

  if (containsAny(text, blockedWords)) {
    return false;
  }

  if (containsAny(text, negativeWords)) {
    return false;
  }

  if (!containsAny(text, healthWords)) {
    return false;
  }

  return true;
}

function buildCountryAliases() {
  const aliases = new Map<string, string>();

  for (const [alias, country] of Object.entries(manualCountryAliases)) {
    aliases.set(alias.toLowerCase(), country);
  }

  try {
    const supportedValuesOf = (Intl as any).supportedValuesOf;

    if (typeof supportedValuesOf === "function") {
      const regionCodes = supportedValuesOf("region") as string[];
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

      for (const code of regionCodes) {
        if (!/^[A-Z]{2}$/.test(code)) continue;

        const name = displayNames.of(code);

        if (name && name.length > 1) {
          aliases.set(name.toLowerCase(), name);
        }
      }
    }
  } catch {
    // Ignore. Manual aliases still work.
  }

  return aliases;
}

const countryAliases = buildCountryAliases();

function findCountryCandidates(text: string) {
  const candidates: string[] = [];
  const clean = normalizeText(text);

  for (const [alias, country] of countryAliases.entries()) {
    const regex = new RegExp(`(^|[^a-z])${escapeRegExp(alias)}([^a-z]|$)`, "i");

    if (regex.test(clean)) {
      candidates.push(country);
    }
  }

  return Array.from(new Set(candidates));
}

function cleanLocationCandidate(value: string) {
  return value
    .replace(/[()[\]{}]/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeBadLocationCandidate(value: string) {
  const clean = normalizeText(value);

  if (clean.length < 3) return true;
  if (clean.length > 60) return true;

  const parts = clean.split(/\s+/g);

  if (parts.length > 5) return true;

  return parts.some((part) => badLocationWords.includes(part));
}

function extractLocationCandidates(title: string, url: string) {
  const candidates: string[] = [];
  const text = decodeHtml(`${title} ${url}`);

  const countryMatches = findCountryCandidates(text);
  candidates.push(...countryMatches);

  const locationPatterns = [
    /\b(?:in|near|from|to|at|off|outside|around)\s+([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+(?:de|da|do|del|la|le|of|the|and|[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+)){0,4})/g,
    /\b([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+,\s*[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,2})\b/g,
  ];

  for (const pattern of locationPatterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const candidate = cleanLocationCandidate(match[1] || "");

      if (!looksLikeBadLocationCandidate(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  const urlParts = url
    .replace(/^https?:\/\//i, "")
    .split(/[/?#&=_-]+/g)
    .map(cleanLocationCandidate)
    .filter(Boolean);

  for (const part of urlParts) {
    if (
      part.length >= 4 &&
      part.length <= 40 &&
      /^[A-Za-zÀ-ž\s.'’-]+$/.test(part) &&
      !looksLikeBadLocationCandidate(part)
    ) {
      const countryHits = findCountryCandidates(part);
      candidates.push(...countryHits);
    }
  }

  return Array.from(new Set(candidates)).slice(0, 6);
}

async function safeFetchText(url: string, timeoutMs = 20000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept:
          "application/json, application/rss+xml, application/xml, text/xml, text/plain, */*",
        "User-Agent":
          "HantavirusRadarBot/1.0 PublicHealthMonitoring contact@hantavirusradar.com",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGdeltArticles() {
  const query =
    'hantavirus OR "andes virus" (case OR confirmed OR outbreak OR patient OR cruise OR ship OR hospital OR hospitalized OR public health OR death) -simpsons -prediction -predictions -meme';

  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    new URLSearchParams({
      query,
      mode: "ArtList",
      format: "json",
      maxrecords: "75",
      sort: "datedesc",
    }).toString();

  const text = await safeFetchText(url, 25000);
  const data = JSON.parse(text);

  if (!Array.isArray(data?.articles)) {
    throw new Error("GDELT returned no articles array.");
  }

  const articles: Article[] = data.articles.map((item: any) => ({
    title: stripTags(String(item?.title || "")),
    url: String(item?.url || ""),
    sourceName: "GDELT",
  }));

  return {
    articles,
    usedUrl: url,
  };
}

function extractXmlTag(item: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = item.match(regex);
  return match ? stripTags(match[1]) : "";
}

function parseRssArticles(xml: string, sourceName: string) {
  const articles: Article[] = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const item of itemMatches) {
    const title = extractXmlTag(item, "title");
    const link = extractXmlTag(item, "link");
    const guid = extractXmlTag(item, "guid");

    const finalUrl = link || guid;

    if (title && finalUrl) {
      articles.push({
        title,
        url: finalUrl,
        sourceName,
      });
    }
  }

  return articles;
}

async function fetchGoogleNewsArticles(query: string) {
  const url =
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q: query,
      hl: "en-US",
      gl: "US",
      ceid: "US:en",
    }).toString();

  const xml = await safeFetchText(url, 20000);
  const articles = parseRssArticles(xml, "Google News RSS");

  return {
    articles,
    usedUrl: url,
  };
}

async function fetchAllInternetArticles() {
  const sourceErrors: string[] = [];
  const allArticles: Article[] = [];
  const usedSources: string[] = [];
  const usedUrls: string[] = [];

  try {
    const gdelt = await fetchGdeltArticles();

    allArticles.push(...gdelt.articles);
    usedSources.push("GDELT");
    usedUrls.push(gdelt.usedUrl);
  } catch (error) {
    sourceErrors.push(`GDELT: ${getErrorMessage(error)}`);
  }

  const googleQueries = [
    "hantavirus confirmed case",
    "hantavirus outbreak",
    "hantavirus cruise ship",
    "hantavirus hospitalized",
    "hantavirus public health",
    "andes virus hantavirus outbreak",
    "andes virus confirmed case",
    "andes virus cruise ship",
  ];

  for (const query of googleQueries) {
    try {
      const google = await fetchGoogleNewsArticles(query);

      allArticles.push(...google.articles);
      usedSources.push(`Google News RSS: ${query}`);
      usedUrls.push(google.usedUrl);
    } catch (error) {
      sourceErrors.push(`Google News RSS ${query}: ${getErrorMessage(error)}`);
    }
  }

  const uniqueArticles = new Map<string, Article>();

  for (const article of allArticles) {
    const key = `${article.title}-${article.url}`;

    if (!uniqueArticles.has(key)) {
      uniqueArticles.set(key, article);
    }
  }

  return {
    articles: Array.from(uniqueArticles.values()),
    sourceErrors,
    usedSources,
    usedUrls,
  };
}

function getAddressCity(address: any) {
  return (
    address?.city ||
    address?.town ||
    address?.village ||
    address?.municipality ||
    address?.county ||
    address?.state_district ||
    address?.state ||
    ""
  );
}

function getAddressRegion(address: any) {
  return (
    address?.state ||
    address?.region ||
    address?.province ||
    address?.county ||
    address?.state_district ||
    ""
  );
}

function getAddressCountry(address: any) {
  return address?.country || "";
}

async function geocodeLocation(query: string): Promise<GeoResult | null> {
  const cleanQuery = cleanLocationCandidate(query);

  if (!cleanQuery || looksLikeBadLocationCandidate(cleanQuery)) {
    return null;
  }

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: cleanQuery,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      email: GEOCODE_EMAIL,
    }).toString();

  const text = await safeFetchText(url, 16000);
  const data = JSON.parse(text);

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const best =
    data.find((item: any) => {
      const type = String(item?.type || "").toLowerCase();
      const category = String(item?.category || "").toLowerCase();
      const addresstype = String(item?.addresstype || "").toLowerCase();

      return (
        category === "boundary" ||
        category === "place" ||
        [
          "city",
          "town",
          "village",
          "municipality",
          "county",
          "state",
          "province",
          "region",
          "country",
          "administrative",
        ].includes(type) ||
        [
          "city",
          "town",
          "village",
          "municipality",
          "county",
          "state",
          "province",
          "region",
          "country",
        ].includes(addresstype)
      );
    }) || data[0];

  const lat = Number(best?.lat);
  const lng = Number(best?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const address = best?.address || {};
  const country = getAddressCountry(address) || cleanQuery;
  const region = getAddressRegion(address) || "";
  const city =
    getAddressCity(address) ||
    address?.country ||
    cleanQuery.split(",")[0] ||
    cleanQuery;

  return {
    city: String(city),
    country: String(country),
    region: String(region),
    lat,
    lng,
  };
}

async function buildSignalsFromArticles(articles: Article[]) {
  const signals: OutbreakSignal[] = [];
  const geocodeCache = new Map<string, GeoResult | null>();
  let geocodeRequests = 0;
  const geocodeErrors: string[] = [];

  const relevantArticles = articles
    .filter((article) => articleLooksRelevant(article.title, article.url))
    .slice(0, MAX_ARTICLES_TO_PROCESS);

  for (const article of relevantArticles) {
    const candidates = extractLocationCandidates(article.title, article.url);

    if (candidates.length === 0) {
      continue;
    }

    let location: GeoResult | null = null;

    for (const candidate of candidates) {
      const key = candidate.toLowerCase();

      if (geocodeCache.has(key)) {
        location = geocodeCache.get(key) || null;
      } else {
        if (geocodeRequests >= MAX_GEOCODE_REQUESTS) {
          break;
        }

        try {
          if (geocodeRequests > 0) {
            await sleep(GEOCODE_DELAY_MS);
          }

          geocodeRequests++;
          location = await geocodeLocation(candidate);
          geocodeCache.set(key, location);
        } catch (error) {
          geocodeErrors.push(`${candidate}: ${getErrorMessage(error)}`);
          geocodeCache.set(key, null);
          location = null;
        }
      }

      if (location) {
        break;
      }
    }

    if (!location) {
      continue;
    }

    signals.push({
      disease: "hantavirus",
      city: location.city,
      country: location.country,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      cases: 1,
      deaths: containsAny(article.title, ["death", "deaths", "dead", "fatal"])
        ? 1
        : 0,
      status: "confirmed",
      source_name: `${article.sourceName} internet scan`,
      source_url: article.url,
      last_update: today(),
      summary: article.title,
    });
  }

  const unique = new Map<string, OutbreakSignal>();

  for (const signal of signals) {
    const key = `${signal.disease}-${signal.city}-${signal.country}`;

    if (!unique.has(key)) {
      unique.set(key, signal);
    } else {
      const existing = unique.get(key)!;

      unique.set(key, {
        ...existing,
        cases: Math.max(existing.cases, signal.cases),
        deaths: Math.max(existing.deaths, signal.deaths),
        last_update: signal.last_update,
        summary: signal.summary,
        source_name: signal.source_name,
        source_url: signal.source_url,
      });
    }
  }

  return {
    signals: Array.from(unique.values()),
    geocodeRequests,
    geocodeErrors,
  };
}

async function insertOrUpdateSignals(
  supabase: SupabaseClient,
  signals: OutbreakSignal[]
) {
  let insertedSignals = 0;
  let updatedSignals = 0;
  let failedSignals = 0;
  const databaseErrors: string[] = [];

  for (const signal of signals) {
    const { data: existingRows, error: selectError } = await supabase
      .from("outbreak_signals")
      .select("id")
      .eq("disease", signal.disease)
      .eq("city", signal.city)
      .eq("country", signal.country)
      .limit(1);

    if (selectError) {
      failedSignals++;
      databaseErrors.push(`Select ${signal.city}, ${signal.country}: ${selectError.message}`);
      continue;
    }

    const existingId = Array.isArray(existingRows) && existingRows[0]?.id;

    if (existingId) {
      const { error: updateError } = await supabase
        .from("outbreak_signals")
        .update({
          region: signal.region,
          lat: signal.lat,
          lng: signal.lng,
          cases: signal.cases,
          deaths: signal.deaths,
          status: signal.status,
          source_name: signal.source_name,
          source_url: signal.source_url,
          last_update: signal.last_update,
          summary: signal.summary,
        })
        .eq("id", existingId);

      if (updateError) {
        failedSignals++;
        databaseErrors.push(`Update ${signal.city}, ${signal.country}: ${updateError.message}`);
        continue;
      }

      updatedSignals++;
    } else {
      const { error: insertError } = await supabase
        .from("outbreak_signals")
        .insert({
          disease: signal.disease,
          city: signal.city,
          country: signal.country,
          region: signal.region,
          lat: signal.lat,
          lng: signal.lng,
          cases: signal.cases,
          deaths: signal.deaths,
          status: signal.status,
          source_name: signal.source_name,
          source_url: signal.source_url,
          last_update: signal.last_update,
          summary: signal.summary,
        });

      if (insertError) {
        failedSignals++;
        databaseErrors.push(`Insert ${signal.city}, ${signal.country}: ${insertError.message}`);
        continue;
      }

      insertedSignals++;
    }
  }

  return {
    insertedSignals,
    updatedSignals,
    failedSignals,
    databaseErrors,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== SCAN_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized scan request.",
      },
      { status: 401 }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { articles, sourceErrors, usedSources, usedUrls } =
    await fetchAllInternetArticles();

  const { signals, geocodeRequests, geocodeErrors } =
    await buildSignalsFromArticles(articles);

  const databaseResult = await insertOrUpdateSignals(supabase, signals);

  return NextResponse.json({
    ok: true,
    mode: "global-internet-scan",
    message:
      "Scanner finished. It searched internet sources, detected global location candidates, geocoded them and saved matching hantavirus signals to Supabase.",
    usedSources,
    usedUrls,
    scannedArticles: articles.length,
    relevantArticles: articles.filter((article) =>
      articleLooksRelevant(article.title, article.url)
    ).length,
    geocodeRequests,
    foundSignals: signals.length,
    insertedSignals: databaseResult.insertedSignals,
    updatedSignals: databaseResult.updatedSignals,
    failedSignals: databaseResult.failedSignals,
    sourceErrors,
    geocodeErrors,
    databaseErrors: databaseResult.databaseErrors,
    results: signals,
    generatedAt: new Date().toISOString(),
  });
}