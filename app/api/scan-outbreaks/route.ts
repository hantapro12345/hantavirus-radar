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

type Article = {
  title: string;
  url: string;
  sourceName: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCAN_SECRET =
  process.env.SCAN_SECRET || "hantavirus_radar_secret_123456789";

const knownLocations = [
  {
    city: "Zurich",
    country: "Switzerland",
    region: "Zurich",
    lat: 47.3769,
    lng: 8.5417,
    keywords: ["zurich", "zürich", "switzerland", "swiss"],
  },
  {
    city: "London",
    country: "United Kingdom",
    region: "England",
    lat: 51.5072,
    lng: -0.1276,
    keywords: ["london", "united kingdom", "uk", "britain", "england"],
  },
  {
    city: "Leiden",
    country: "Netherlands",
    region: "South Holland",
    lat: 52.1601,
    lng: 4.497,
    keywords: ["leiden", "netherlands", "dutch", "holland"],
  },
  {
    city: "Dusseldorf",
    country: "Germany",
    region: "North Rhine-Westphalia",
    lat: 51.2277,
    lng: 6.7735,
    keywords: ["dusseldorf", "düsseldorf", "germany", "german"],
  },
  {
    city: "Ushuaia",
    country: "Argentina",
    region: "Tierra del Fuego",
    lat: -54.8019,
    lng: -68.303,
    keywords: ["ushuaia", "argentina", "tierra del fuego"],
  },
];

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
];

const healthWords = [
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
  "hantavirus",
  "virus",
  "disease",
  "cdc",
  "who",
  "ecdc",
  "ministry",
  "cruise",
  "ship",
  "travel",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
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

  if (!clean.includes("hantavirus")) return false;
  if (containsAny(text, blockedWords)) return false;
  if (containsAny(text, negativeWords)) return false;
  if (!containsAny(text, healthWords)) return false;

  return true;
}

function detectLocation(title: string, url: string) {
  const text = normalizeText(`${title} ${url}`);

  for (const location of knownLocations) {
    const matched = location.keywords.some((keyword) =>
      text.includes(normalizeText(keyword))
    );

    if (matched) {
      return location;
    }
  }

  return null;
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
          "Mozilla/5.0 HantavirusRadarBot/1.0 PublicHealthMonitoring",
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
    'hantavirus (case OR confirmed OR outbreak OR patient OR cruise OR ship OR hospital OR "public health") -simpsons -prediction -predictions';

  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    new URLSearchParams({
      query,
      mode: "ArtList",
      format: "json",
      maxrecords: "50",
      sort: "datedesc",
    }).toString();

  const text = await safeFetchText(url, 25000);
  const data = JSON.parse(text);

  if (!Array.isArray(data?.articles)) {
    throw new Error("GDELT returned no articles array.");
  }

  const articles: Article[] = data.articles.map((item: any) => ({
    title: String(item?.title || ""),
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
    "hantavirus public health",
    "hantavirus patient hospital",
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

function buildSignalsFromArticles(articles: Article[]) {
  const signals: OutbreakSignal[] = [];

  for (const article of articles) {
    const title = article.title;
    const url = article.url;

    if (!title || !url) continue;
    if (!articleLooksRelevant(title, url)) continue;

    const location = detectLocation(title, url);

    if (!location) continue;

    signals.push({
      disease: "hantavirus",
      city: location.city,
      country: location.country,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      cases: 1,
      deaths: 0,
      status: "confirmed",
      source_name: `${article.sourceName} internet scan / verified news monitoring`,
      source_url: url,
      last_update: today(),
      summary: title,
    });
  }

  const unique = new Map<string, OutbreakSignal>();

  for (const signal of signals) {
    const key = `${signal.city}-${signal.country}`;

    if (!unique.has(key)) {
      unique.set(key, signal);
    }
  }

  return Array.from(unique.values());
}

async function insertOrUpdateSignals(signals: OutbreakSignal[]) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let insertedOrUpdatedSignals = 0;
  let failedInserts = 0;
  const insertErrors: string[] = [];

  for (const signal of signals) {
    const { data: existingRows, error: findError } = await supabase
      .from("outbreak_signals")
      .select("id")
      .eq("disease", "hantavirus")
      .eq("city", signal.city)
      .eq("country", signal.country)
      .limit(1);

    if (findError) {
      failedInserts++;
      insertErrors.push(findError.message);
      continue;
    }

    const existingId = existingRows?.[0]?.id;

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
        failedInserts++;
        insertErrors.push(updateError.message);
        continue;
      }

      insertedOrUpdatedSignals++;
      continue;
    }

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
      failedInserts++;
      insertErrors.push(insertError.message);
      continue;
    }

    insertedOrUpdatedSignals++;
  }

  return {
    insertedOrUpdatedSignals,
    failedInserts,
    insertErrors,
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

  try {
    const { articles, sourceErrors, usedSources, usedUrls } =
      await fetchAllInternetArticles();

    const signals = buildSignalsFromArticles(articles);
    const insertResult = await insertOrUpdateSignals(signals);

    return NextResponse.json({
      ok: true,
      mode: "internet-scan",
      message: "Scanner finished.",
      usedSources,
      usedUrls,
      scannedArticles: articles.length,
      foundSignals: signals.length,
      insertedOrUpdatedSignals: insertResult.insertedOrUpdatedSignals,
      failedInserts: insertResult.failedInserts,
      sourceErrors,
      insertErrors: insertResult.insertErrors,
      results: signals,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "internet-scan",
        error: "Scanner failed.",
        cause: getErrorMessage(error),
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}