import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EventStatus = "monitored" | "suspected" | "confirmed" | "death" | "ruled_out";
type RawSignalStatus =
  | "candidate"
  | "needs_review"
  | "rejected"
  | "linked_to_event"
  | "duplicate";

type Visibility = "public" | "review" | "hidden";

type CountrySeed = {
  country_name: string;
  country_code: string;
  region: string;
  languages: string[];
  priority: number;
  search_terms: string[];
};

type Article = {
  title: string;
  url: string;
  sourceName: string;
  publishedAt?: string | null;
  snippet?: string;
};

type Counts = {
  status: EventStatus;
  caseCount: number;
  confirmedCount: number;
  suspectedCount: number;
  monitoredCount: number;
  deathCount: number;
  explicitCountFound: boolean;
};

type AnalyzedArticle = {
  article: Article;
  country: CountrySeed;
  rawText: string;
  cleanText: string;
  contentHash: string;

  rawStatus: RawSignalStatus;
  rejectionReason: string | null;

  eventStatus: EventStatus;
  visibility: Visibility;

  headline: string;
  summary: string;

  city: string;
  region: string;
  countryName: string;
  countryCode: string;

  latitude: number | null;
  longitude: number | null;
  locationLabel: string;

  caseCount: number;
  confirmedCount: number;
  suspectedCount: number;
  monitoredCount: number;
  deathCount: number;

  eventDate: string | null;
  reportedDate: string | null;

  confidenceScore: number;

  tags: string[];
  extractedJson: Record<string, unknown>;
};

type NominatimAddress = Record<string, unknown>;
type GdeltArticle = Record<string, unknown>;

type CountryScanProcessedArticle = {
  rawStatus: RawSignalStatus;
  rejectionReason: string | null;
  eventCreated: boolean;
  eventUpdated: boolean;
  city: string;
  status: EventStatus;
  confirmed: number;
  suspected: number;
  monitored: number;
  deaths: number;
  confidence: number;
  title: string;
  source: string;
};

type CountryScanResult = {
  country: string;
  articlesFound: number;
  rawInserted: number;
  candidates: number;
  review: number;
  rejected: number;
  duplicates: number;
  eventsCreated: number;
  eventsUpdated: number;
  processed: CountryScanProcessedArticle[];
  errors: string[];
  durationMs: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCAN_SECRET =
  process.env.SCAN_SECRET || "hantavirus_radar_secret_123456789";
const GEOCODE_EMAIL =
  process.env.GEOCODE_EMAIL || "contact@hantavirusradar.com";

const MAX_COUNTRIES_PER_RUN = Number(process.env.SCAN_COUNTRY_BATCH_SIZE || 6);
const MAX_ARTICLES_PER_COUNTRY = Number(
  process.env.SCAN_MAX_ARTICLES_PER_COUNTRY || 12
);
const MAX_FULL_TEXT_FETCHES_PER_COUNTRY = Number(
  process.env.SCAN_MAX_FULL_TEXT_FETCHES_PER_COUNTRY || 5
);
const MAX_GEOCODE_REQUESTS_PER_RUN = Number(
  process.env.SCAN_MAX_GEOCODE_REQUESTS || 18
);

let geocodeRequestsThisRun = 0;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const baseSearchTerms = [
  "hantavirus",
  '"hantavirus case"',
  '"hantavirus outbreak"',
  '"hantavirus confirmed"',
  '"hantavirus death"',
  '"hantavirus exposure"',
  '"hantavirus pulmonary syndrome"',
  '"Andes virus"',
  '"Andes virus case"',
  '"virus hanta"',
  '"fiebre por hantavirus"',
  '"síndrome pulmonar por hantavirus"',
  '"hantavirose"',
];

const manualCountries: CountrySeed[] = [
  {
    country_name: "United States",
    country_code: "US",
    region: "North America",
    languages: ["en"],
    priority: 1,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Mexico",
    country_code: "MX",
    region: "North America",
    languages: ["es", "en"],
    priority: 1,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Argentina",
    country_code: "AR",
    region: "South America",
    languages: ["es", "en"],
    priority: 1,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Chile",
    country_code: "CL",
    region: "South America",
    languages: ["es", "en"],
    priority: 1,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Canada",
    country_code: "CA",
    region: "North America",
    languages: ["en", "fr"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Brazil",
    country_code: "BR",
    region: "South America",
    languages: ["pt", "en"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Panama",
    country_code: "PA",
    region: "Central America",
    languages: ["es", "en"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Switzerland",
    country_code: "CH",
    region: "Europe",
    languages: ["en", "de", "fr", "it"],
    priority: 1,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Germany",
    country_code: "DE",
    region: "Europe",
    languages: ["de", "en"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Spain",
    country_code: "ES",
    region: "Europe",
    languages: ["es", "en"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Canary Islands",
    country_code: "ES",
    region: "Spain / Canary Islands",
    languages: ["es", "en"],
    priority: 1,
    search_terms: [
      ...baseSearchTerms,
      '"hantavirus" "Canary Islands"',
      '"hantavirus" Tenerife',
      '"hantavirus" "Gran Canaria"',
      '"hantavirus" Lanzarote',
      '"hantavirus" Fuerteventura',
      '"hantavirus" "La Palma"',
      '"virus hanta" Canarias',
      '"hantavirus" Canarias',
    ],
  },
  {
    country_name: "United Kingdom",
    country_code: "GB",
    region: "Europe",
    languages: ["en"],
    priority: 2,
    search_terms: baseSearchTerms,
  },
  {
    country_name: "Poland",
    country_code: "PL",
    region: "Europe",
    languages: ["pl", "en"],
    priority: 3,
    search_terms: baseSearchTerms,
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
  "movie",
  "series",
  "game",
];

const negativePhrases = [
  "tested negative",
  "tests negative",
  "test negative",
  "negative for hantavirus",
  "not hantavirus",
  "no hantavirus",
  "no cases",
  "no confirmed cases",
  "no new cases",
  "ruled out",
  "false alarm",
  "hoax",
];

const healthContextWords = [
  "case",
  "cases",
  "confirmed",
  "suspected",
  "patient",
  "patients",
  "positive",
  "tested positive",
  "public health",
  "health department",
  "ministry of health",
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
  "exposure",
  "exposed",
  "monitoring",
  "monitored",
  "rodent",
  "rodents",
  "mouse",
  "mice",
  "rat",
  "rats",
  "cruise",
  "ship",
  "passenger",
  "passengers",
  "quarantine",
  "quarantined",
  "evacuated",
];

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,

  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,

  um: 1,
  uma: 1,
  duas: 2,
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return String(value || "")
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
  return decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function containsAny(text: string, words: string[]) {
  const clean = normalizeText(text);
  return words.some((word) => clean.includes(normalizeText(word)));
}

function looksRelevant(title: string, url: string, snippet = "") {
  const text = `${title} ${snippet} ${url}`;
  const clean = normalizeText(text);

  const hasDisease =
    clean.includes("hantavirus") ||
    clean.includes("hanta virus") ||
    clean.includes("virus hanta") ||
    clean.includes("andes virus") ||
    clean.includes("hantavirose");

  if (!hasDisease) return false;
  if (containsAny(text, blockedWords)) return false;

  return true;
}

function looksRuledOut(text: string) {
  return containsAny(text, negativePhrases);
}

function parseNumberToken(token: string) {
  const clean = normalizeText(token).replace(/[,.]/g, "");

  if (/^\d+$/.test(clean)) return Number(clean);
  if (numberWords[clean] !== undefined) return numberWords[clean];

  return null;
}

function maxFromPatterns(text: string, patterns: RegExp[]) {
  let max = 0;

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const raw = match[1] || match[2] || "";
      const parsed = parseNumberToken(raw);

      if (parsed !== null && parsed > max) {
        max = parsed;
      }
    }
  }

  return max;
}

function extractCounts(text: string): Counts {
  const clean = normalizeText(text);

  if (looksRuledOut(clean)) {
    return {
      status: "ruled_out",
      caseCount: 0,
      confirmedCount: 0,
      suspectedCount: 0,
      monitoredCount: 0,
      deathCount: 0,
      explicitCountFound: true,
    };
  }

  const n =
    "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|um|uma|duas)";

  let confirmedCount = maxFromPatterns(clean, [
    new RegExp(
      `${n}\\s+(?:new\\s+)?(?:confirmed\\s+)?(?:human\\s+)?(?:hantavirus\\s+)?cases?`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:new\\s+)?(?:human\\s+)?(?:hantavirus\\s+)?infections?`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:people|patients?|persons|passengers)\\s+(?:tested\\s+)?positive`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:confirmed\\s+)?(?:hantavirus\\s+)?patients?`,
      "gi"
    ),
    new RegExp(`${n}\\s+casos?\\s+(?:confirmados?|de\\s+hantavirus)`, "gi"),
    new RegExp(`${n}\\s+casos?\\s+de\\s+virus\\s+hanta`, "gi"),
    new RegExp(`${n}\\s+casos?\\s+de\\s+hantavirose`, "gi"),
    new RegExp(
      `(?:total|outbreak\\s+total|case\\s+total|total\\s+cases?)\\s+(?:to|of|is|reaches|rose\\s+to|rises\\s+to)?\\s*${n}`,
      "gi"
    ),
    new RegExp(
      `(?:brings|bringing|raises|raised)\\s+(?:the\\s+)?(?:outbreak\\s+)?total\\s+to\\s+${n}`,
      "gi"
    ),
  ]);

  let suspectedCount = maxFromPatterns(clean, [
    new RegExp(
      `${n}\\s+(?:suspected|probable|possible)\\s+(?:hantavirus\\s+)?cases?`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:people|patients?|persons)\\s+(?:with\\s+)?(?:suspected|probable|possible)\\s+hantavirus`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+casos?\\s+(?:sospechosos?|probables?|posibles?|prováveis|suspeitos)`,
      "gi"
    ),
  ]);

  const monitoredCount = maxFromPatterns(clean, [
    new RegExp(
      `${n}\\s+(?:people|persons|contacts|passengers|patients?|crew\\s+members)\\s+(?:are\\s+)?(?:being\\s+)?(?:monitored|under\\s+monitoring|observed|under\\s+observation|quarantined|isolated)`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:people|persons|contacts|passengers|crew\\s+members)\\s+(?:were\\s+)?(?:evacuated|exposed|traced|contacted|screened)`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+(?:evacuated|exposed|monitored|quarantined|isolated)\\s+(?:people|persons|contacts|passengers|crew\\s+members)`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+personas?\\s+(?:monitoreadas?|en\\s+observación|expuestas?|evacuadas?|aisladas?)`,
      "gi"
    ),
    new RegExp(
      `${n}\\s+pessoas?\\s+(?:monitoradas?|em\\s+observação|expostas?|evacuadas?|isoladas?)`,
      "gi"
    ),
  ]);

  let deathCount = maxFromPatterns(clean, [
    new RegExp(`${n}\\s+(?:hantavirus\\s+)?deaths?`, "gi"),
    new RegExp(`${n}\\s+(?:people|patients?|persons)\\s+(?:died|dead)`, "gi"),
    new RegExp(`${n}\\s+(?:fatalities|fatal\\s+cases?)`, "gi"),
    new RegExp(`${n}\\s+muertes?`, "gi"),
    new RegExp(`${n}\\s+fallecidos?`, "gi"),
    new RegExp(`${n}\\s+mortes?`, "gi"),
    new RegExp(`${n}\\s+óbitos?`, "gi"),
  ]);

  const singularConfirmedEvidence =
    /\b(?:a|an|one|1)\s+(?:new\s+)?(?:confirmed\s+)?(?:human\s+)?(?:hantavirus\s+)?case\b/i.test(
      clean
    ) ||
    /\b(?:new|confirmed|reported|reports|reporting|detects|detected|registers|registered|confirms|confirmed)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:human\s+)?(?:hantavirus\s+)?case\b/i.test(
      clean
    ) ||
    /\b(?:hantavirus|andes virus|virus hanta)\s+case\b/i.test(clean) ||
    /\bcase\s+(?:of|linked\s+to|tied\s+to)\s+(?:hantavirus|andes virus|virus hanta)\b/i.test(
      clean
    ) ||
    /\bcaso\s+(?:confirmado\s+)?(?:de\s+)?(?:hantavirus|virus hanta)\b/i.test(
      clean
    ) ||
    /\bcaso\s+(?:de\s+)?hantavirose\b/i.test(clean);

  const singularSuspectedEvidence =
    /\b(?:a|an|one|1)\s+(?:suspected|probable|possible)\s+(?:hantavirus\s+)?case\b/i.test(
      clean
    ) ||
    /\b(?:suspected|probable|possible)\s+(?:hantavirus\s+)?case\b/i.test(
      clean
    ) ||
    /\bcaso\s+(?:sospechoso|probable|posible|suspeito|provável)\b/i.test(
      clean
    );

  const singularDeathEvidence =
    /\b(?:a|an|one|1)\s+(?:hantavirus\s+)?death\b/i.test(clean) ||
    /\b(?:hantavirus|andes virus|virus hanta)\s+death\b/i.test(clean) ||
    /\bdeath\s+(?:from|linked\s+to|tied\s+to)\s+(?:hantavirus|andes virus|virus hanta)\b/i.test(
      clean
    );

  if (confirmedCount === 0 && singularConfirmedEvidence) confirmedCount = 1;
  if (suspectedCount === 0 && singularSuspectedEvidence) suspectedCount = 1;
  if (deathCount === 0 && singularDeathEvidence) deathCount = 1;

  const explicitCountFound =
    confirmedCount > 0 ||
    suspectedCount > 0 ||
    monitoredCount > 0 ||
    deathCount > 0;

  let status: EventStatus = "monitored";

  if (deathCount > 0) status = "death";
  else if (confirmedCount > 0) status = "confirmed";
  else if (suspectedCount > 0) status = "suspected";
  else if (monitoredCount > 0) status = "monitored";

  return {
    status,
    caseCount: confirmedCount,
    confirmedCount,
    suspectedCount,
    monitoredCount,
    deathCount,
    explicitCountFound,
  };
}

function extractDate(text: string) {
  const iso = text.match(
    /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/
  );

  if (iso) {
    const yyyy = iso[1];
    const mm = iso[2].padStart(2, "0");
    const dd = iso[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return todayDate();
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
    const description = extractXmlTag(item, "description");
    const pubDate = extractXmlTag(item, "pubDate");
    const finalUrl = link || guid;

    if (title && finalUrl) {
      articles.push({
        title,
        url: finalUrl,
        sourceName,
        publishedAt: pubDate || null,
        snippet: description || "",
      });
    }
  }

  return articles;
}

async function safeFetchText(url: string, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept:
          "application/json, application/rss+xml, application/xml, text/xml, text/html, text/plain, */*",
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
  return parseRssArticles(xml, "Google News RSS");
}

async function fetchGdeltArticles(query: string) {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    new URLSearchParams({
      query,
      mode: "ArtList",
      format: "json",
      maxrecords: "25",
      sort: "datedesc",
    }).toString();

  const text = await safeFetchText(url, 25000);
  const data = JSON.parse(text);

  if (!Array.isArray(data?.articles)) return [];

  return data.articles.map((item: GdeltArticle) => ({
    title: stripTags(String(item.title ?? "")),
    url: String(item.url ?? ""),
    sourceName: "GDELT",
    publishedAt: typeof item.seendate === "string" ? item.seendate : null,
    snippet: "",
  })) as Article[];
}

async function fetchArticlesForCountry(countryName: string, countryCode: string) {
  const customCountry = manualCountries.find(
    (country) => country.country_name === countryName
  );

  const customTerms = customCountry?.search_terms || baseSearchTerms;

  const queries = [
    `hantavirus ${countryName}`,
    `"hantavirus case" ${countryName}`,
    `"hantavirus outbreak" ${countryName}`,
    `"hantavirus death" ${countryName}`,
    `"Andes virus" ${countryName}`,
    `"virus hanta" ${countryName}`,
    `"hantavirus" "${countryCode}"`,
    ...customTerms.map((term) => `${term} ${countryName}`),
  ];

  const all: Article[] = [];

  for (const query of queries) {
    try {
      const google = await fetchGoogleNewsArticles(query);
      all.push(...google);
    } catch {}

    try {
      const gdelt = await fetchGdeltArticles(query);
      all.push(...gdelt);
    } catch {}
  }

  const unique = new Map<string, Article>();

  for (const article of all) {
    if (!article.url || !article.title) continue;

    const key = article.url.split("?")[0];

    if (!unique.has(key)) {
      unique.set(key, article);
    }
  }

  return Array.from(unique.values())
    .filter((article) =>
      looksRelevant(article.title, article.url, article.snippet || "")
    )
    .slice(0, MAX_ARTICLES_PER_COUNTRY);
}

function htmlToReadableText(html: string) {
  return stripTags(html).slice(0, 18000);
}

async function fetchArticleText(article: Article) {
  try {
    const raw = await safeFetchText(article.url, 18000);

    if (raw.trim().startsWith("<") || raw.includes("<html")) {
      return htmlToReadableText(raw);
    }

    return stripTags(raw).slice(0, 18000);
  } catch {
    return `${article.title}. ${article.snippet || ""}`;
  }
}

function extractCityCandidate(text: string, countryName: string) {
  const countryEscaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    /\bin\s+([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,3})/g,
    /\bnear\s+([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,3})/g,
    /\bfrom\s+([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,3})/g,
    /\ben\s+([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,3})/g,
    new RegExp(
      `([A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+(?:\\s+[A-ZÀ-Ž][A-Za-zÀ-ž'’.-]+){0,3}),\\s*${countryEscaped}`,
      "g"
    ),
  ];

  const bad = [
    "Hantavirus",
    "Andes Virus",
    "Public Health",
    "Health Department",
    "Ministry Of Health",
    "Confirmed",
    "Suspected",
    "Hospital",
    "Patient",
    "Patients",
    "Case",
    "Cases",
    "Death",
    "Deaths",
    "Google News",
    "Reuters",
    "BBC",
    "CNN",
    "NBC",
  ].map((x) => x.toLowerCase());

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const candidate = String(match[1] || "").trim();

      if (candidate.length < 3 || candidate.length > 60) continue;
      if (bad.includes(candidate.toLowerCase())) continue;
      if (candidate.toLowerCase() === countryName.toLowerCase()) continue;

      return candidate;
    }
  }

  return countryName;
}

function getAddressCity(address: NominatimAddress | undefined) {
  if (!address) return "";

  return (
    readOptionalString(address.city) ||
    readOptionalString(address.town) ||
    readOptionalString(address.village) ||
    readOptionalString(address.municipality) ||
    readOptionalString(address.county) ||
    readOptionalString(address.state_district) ||
    readOptionalString(address.state) ||
    ""
  );
}

function getAddressRegion(address: NominatimAddress | undefined) {
  if (!address) return "";

  return (
    readOptionalString(address.state) ||
    readOptionalString(address.region) ||
    readOptionalString(address.province) ||
    readOptionalString(address.county) ||
    ""
  );
}

async function geocodeLocation(query: string) {
  if (geocodeRequestsThisRun >= MAX_GEOCODE_REQUESTS_PER_RUN) return null;

  geocodeRequestsThisRun++;

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "3",
      email: GEOCODE_EMAIL,
    }).toString();

  const text = await safeFetchText(url, 16000);
  const data = JSON.parse(text);

  if (!Array.isArray(data) || data.length === 0) return null;

  const best = data[0];
  const lat = Number(best?.lat);
  const lng = Number(best?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addressRaw = best?.address;
  const address: NominatimAddress =
    addressRaw !== null && typeof addressRaw === "object"
      ? (addressRaw as NominatimAddress)
      : {};

  return {
    lat,
    lng,
    city: getAddressCity(address) || query.split(",")[0] || query,
    region: getAddressRegion(address),
    country: address?.country || "",
    label: best?.display_name || query,
  };
}

function calculateConfidence(params: {
  text: string;
  explicitCountFound: boolean;
  hasCoordinates: boolean;
  status: EventStatus;
}) {
  let score = 0.25;

  if (containsAny(params.text, healthContextWords)) score += 0.15;
  if (params.explicitCountFound) score += 0.25;
  if (params.hasCoordinates) score += 0.15;
  if (params.status === "confirmed" || params.status === "death") score += 0.1;

  if (
    containsAny(params.text, [
      "ministry",
      "department of health",
      "public health",
      "cdc",
      "who",
      "paho",
      "ecdc",
    ])
  ) {
    score += 0.1;
  }

  return Math.min(0.98, Number(score.toFixed(3)));
}

async function analyzeArticle(
  country: CountrySeed,
  article: Article
): Promise<AnalyzedArticle> {
  const fullText = await fetchArticleText(article);
  const combinedText = `${article.title}. ${article.snippet || ""}. ${fullText}`;
  const cleanText = normalizeText(combinedText);
  const counts = extractCounts(combinedText);

  const cityCandidate = extractCityCandidate(combinedText, country.country_name);
  const geocodeQuery =
    cityCandidate.toLowerCase() === country.country_name.toLowerCase()
      ? country.country_name
      : `${cityCandidate}, ${country.country_name}`;

  let geocode: Awaited<ReturnType<typeof geocodeLocation>> = null;

  try {
    geocode = await geocodeLocation(geocodeQuery);
    await sleep(900);
  } catch {
    geocode = null;
  }

  const confidenceScore = calculateConfidence({
    text: combinedText,
    explicitCountFound: counts.explicitCountFound,
    hasCoordinates: Boolean(geocode),
    status: counts.status,
  });

  let rawStatus: RawSignalStatus = "candidate";
  let rejectionReason: string | null = null;
  let visibility: Visibility = "review";

  if (counts.status === "ruled_out") {
    rawStatus = "rejected";
    rejectionReason =
      "Article appears to rule out hantavirus or report negative testing.";
    visibility = "hidden";
  } else if (!containsAny(combinedText, healthContextWords)) {
    rawStatus = "needs_review";
    rejectionReason = "Article mentions hantavirus but health/outbreak context is weak.";
  } else if (!counts.explicitCountFound) {
    rawStatus = "needs_review";
    rejectionReason =
      "No explicit case, death, suspected or monitored count found.";
  } else if (!geocode) {
    rawStatus = "needs_review";
    rejectionReason = "Explicit count found, but location could not be geocoded.";
  } else {
    rawStatus = "candidate";
    rejectionReason = null;
    visibility = confidenceScore >= 0.72 ? "public" : "review";
  }

  const finalCity = geocode?.city || cityCandidate || country.country_name;
  const finalRegion = geocode?.region || country.region || "";
  const locationLabel =
    geocode?.label ||
    [finalCity, finalRegion, country.country_name].filter(Boolean).join(", ");

  return {
    article,
    country,
    rawText: combinedText.slice(0, 18000),
    cleanText,
    contentHash: hashText(`${article.url}-${article.title}`),

    rawStatus,
    rejectionReason,

    eventStatus: counts.status,
    visibility,

    headline: article.title.slice(0, 280),
    summary: stripTags(`${article.title}. ${article.snippet || ""}`).slice(0, 900),

    city: finalCity,
    region: finalRegion,
    countryName: country.country_name,
    countryCode: country.country_code,

    latitude: geocode?.lat || null,
    longitude: geocode?.lng || null,
    locationLabel,

    caseCount: counts.caseCount,
    confirmedCount: counts.confirmedCount,
    suspectedCount: counts.suspectedCount,
    monitoredCount: counts.monitoredCount,
    deathCount: counts.deathCount,

    eventDate: extractDate(combinedText),
    reportedDate: article.publishedAt ? null : todayDate(),

    confidenceScore,

    tags: ["agent", "global-scan", "raw-discovery"],
    extractedJson: {
      article,
      country: country.country_name,
      cityCandidate,
      geocodeQuery,
      geocode,
      explicitCountFound: counts.explicitCountFound,
      rejectionReason,
      fullTextLength: fullText.length,
    },
  };
}

async function ensureCountriesSeeded() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");

  for (const seed of manualCountries) {
    await supabaseAdmin.from("monitored_countries").upsert(
      {
        country_name: seed.country_name,
        country_code: seed.country_code,
        region: seed.region,
        languages: seed.languages,
        search_terms: seed.search_terms,
        priority: seed.priority,
        is_active: true,
        next_scan_at: new Date().toISOString(),
      },
      { onConflict: "country_name" }
    );
  }

  return manualCountries.length;
}

async function createIngestionRun() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");

  const { data, error } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({
      run_type: "global_country_scan",
      status: "running",
      metadata: {
        maxCountriesPerRun: MAX_COUNTRIES_PER_RUN,
        maxArticlesPerCountry: MAX_ARTICLES_PER_COUNTRY,
        generatedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function finishIngestionRun(
  runId: string,
  status: string,
  counters: Record<string, unknown>
) {
  if (!supabaseAdmin) return;

  await supabaseAdmin
    .from("ingestion_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      ...counters,
    })
    .eq("id", runId);
}

async function logAgentError(runId: string, stage: string, error: unknown) {
  if (!supabaseAdmin) return;

  await supabaseAdmin.from("agent_errors").insert({
    ingestion_run_id: runId,
    severity: "medium",
    agent_name: "global_country_scan",
    stage,
    error_message: getErrorMessage(error),
    error_details: {
      generatedAt: new Date().toISOString(),
    },
  });
}

async function getCountriesToScan() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");

  const { data, error } = await supabaseAdmin
    .from("monitored_countries")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("last_scanned_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COUNTRIES_PER_RUN);

  if (error) throw new Error(error.message);

  return (data || []) as CountrySeed[];
}

async function insertRawSignal(runId: string, analyzed: AnalyzedArticle) {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");

  const { data: existing } = await supabaseAdmin
    .from("raw_signals")
    .select("id,status")
    .eq("content_hash", analyzed.contentHash)
    .limit(1);

  if (Array.isArray(existing) && existing.length > 0) {
    return {
      rawSignalId: existing[0].id as string,
      duplicate: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("raw_signals")
    .insert({
      ingestion_run_id: runId,
      status: analyzed.rawStatus,
      source_url: analyzed.article.url,
      source_name: analyzed.article.sourceName,
      source_type: analyzed.article.sourceName === "GDELT" ? "aggregator" : "news",
      title: analyzed.headline,
      snippet: analyzed.summary,
      raw_text: analyzed.rawText,
      language: "unknown",
      published_at: null,
      extracted_json: analyzed.extractedJson,
      possible_country: analyzed.countryName,
      possible_region: analyzed.region,
      possible_city: analyzed.city,
      possible_event_date: analyzed.eventDate,
      possible_case_count: analyzed.caseCount,
      possible_death_count: analyzed.deathCount,
      possible_suspected_count: analyzed.suspectedCount,
      possible_monitored_count: analyzed.monitoredCount,
      ai_relevance_score: analyzed.confidenceScore,
      ai_confidence_score: analyzed.confidenceScore,
      rejection_reason: analyzed.rejectionReason,
      content_hash: analyzed.contentHash,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    rawSignalId: data.id as string,
    duplicate: false,
  };
}

async function upsertOutbreakEvent(analyzed: AnalyzedArticle, rawSignalId: string) {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");

  if (analyzed.rawStatus !== "candidate") {
    return {
      eventId: null,
      created: false,
      updated: false,
      skipped: true,
    };
  }

  if (!analyzed.latitude || !analyzed.longitude) {
    return {
      eventId: null,
      created: false,
      updated: false,
      skipped: true,
    };
  }

  const eventDate = analyzed.eventDate || todayDate();

  const { data: existingRows, error: selectError } = await supabaseAdmin
    .from("outbreak_events")
    .select("id")
    .eq("country", analyzed.countryName)
    .eq("city", analyzed.city)
    .eq("event_date", eventDate)
    .eq("primary_source_url", analyzed.article.url)
    .limit(1);

  if (selectError) throw new Error(selectError.message);

  let eventId: string;
  let created = false;
  let updated = false;

  const payload = {
    disease: "Hantavirus",
    pathogen: "Hantavirus",
    status: analyzed.eventStatus,
    visibility: analyzed.visibility,
    headline: analyzed.headline,
    summary: analyzed.summary,
    country: analyzed.countryName,
    country_code: analyzed.countryCode,
    region: analyzed.region,
    city: analyzed.city,
    latitude: analyzed.latitude,
    longitude: analyzed.longitude,
    location_label: analyzed.locationLabel,
    case_count: analyzed.caseCount,
    death_count: analyzed.deathCount,
    monitored_count: analyzed.monitoredCount,
    suspected_count: analyzed.suspectedCount,
    confirmed_count: analyzed.confirmedCount,
    event_date: eventDate,
    reported_date: analyzed.reportedDate || eventDate,
    confidence_score: analyzed.confidenceScore,
    primary_source_url: analyzed.article.url,
    primary_source_name: analyzed.article.sourceName,
    primary_source_type: analyzed.article.sourceName === "GDELT" ? "aggregator" : "news",
    tags: analyzed.tags,
    raw_metadata: analyzed.extractedJson,
    last_seen_at: new Date().toISOString(),
  };

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    eventId = existingRows[0].id as string;

    const { error: updateError } = await supabaseAdmin
      .from("outbreak_events")
      .update(payload)
      .eq("id", eventId);

    if (updateError) throw new Error(updateError.message);
    updated = true;
  } else {
    const { data, error } = await supabaseAdmin
      .from("outbreak_events")
      .insert({
        ...payload,
        created_by_agent: true,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    eventId = data.id as string;
    created = true;
  }

  await supabaseAdmin.from("event_sources").upsert(
    {
      event_id: eventId,
      raw_signal_id: rawSignalId,
      source_url: analyzed.article.url,
      source_name: analyzed.article.sourceName,
      source_type: analyzed.article.sourceName === "GDELT" ? "aggregator" : "news",
      title: analyzed.headline,
      published_at: null,
      quote: analyzed.summary.slice(0, 600),
      summary: analyzed.summary,
      reliability_score: analyzed.confidenceScore,
      supports_status: analyzed.eventStatus,
    },
    { onConflict: "event_id,source_url" }
  );

  await supabaseAdmin
    .from("raw_signals")
    .update({
      linked_event_id: eventId,
      status: "linked_to_event",
    })
    .eq("id", rawSignalId);

  return {
    eventId,
    created,
    updated,
    skipped: false,
  };
}

async function markCountryScanned(countryName: string) {
  if (!supabaseAdmin) return;

  await supabaseAdmin
    .from("monitored_countries")
    .update({
      last_scanned_at: new Date().toISOString(),
      next_scan_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    })
    .eq("country_name", countryName);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestUrl = new URL(request.url);
  const secret = requestUrl.searchParams.get("secret");
  const mode = requestUrl.searchParams.get("mode") || "scan";

  if (secret !== SCAN_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized scan request.",
      },
      { status: 401 }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !supabaseAdmin) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  const seededCountries = await ensureCountriesSeeded();

  if (mode === "seed") {
    return NextResponse.json({
      ok: true,
      mode: "seed",
      seededCountries,
      message: "Monitored countries were seeded.",
      generatedAt: new Date().toISOString(),
    });
  }

  const runId = await createIngestionRun();

  let sourcesChecked = 0;
  let rawSignalsInserted = 0;
  let reviewSignalsInserted = 0;
  let rejectedSignalsInserted = 0;
  let candidateSignalsInserted = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let duplicatesFound = 0;
  let errorsCount = 0;

  const countryResults: CountryScanResult[] = [];

  try {
    const countriesToScan = await getCountriesToScan();

    for (const country of countriesToScan) {
      const countryStartedAt = Date.now();

      const countryResult: CountryScanResult = {
        country: country.country_name,
        articlesFound: 0,
        rawInserted: 0,
        candidates: 0,
        review: 0,
        rejected: 0,
        duplicates: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        processed: [],
        errors: [],
        durationMs: 0,
      };

      try {
        const articles = await fetchArticlesForCountry(
          country.country_name,
          country.country_code
        );

        countryResult.articlesFound = articles.length;
        sourcesChecked += articles.length;

        let fullTextFetches = 0;

        for (const article of articles) {
          if (fullTextFetches >= MAX_FULL_TEXT_FETCHES_PER_COUNTRY) break;

          fullTextFetches++;

          try {
            const analyzed = await analyzeArticle(country, article);
            const raw = await insertRawSignal(runId, analyzed);

            if (raw.duplicate) {
              duplicatesFound++;
              countryResult.duplicates++;
              continue;
            }

            rawSignalsInserted++;
            countryResult.rawInserted++;

            if (analyzed.rawStatus === "candidate") {
              candidateSignalsInserted++;
              countryResult.candidates++;
            }

            if (analyzed.rawStatus === "needs_review") {
              reviewSignalsInserted++;
              countryResult.review++;
            }

            if (analyzed.rawStatus === "rejected") {
              rejectedSignalsInserted++;
              countryResult.rejected++;
            }

            const eventResult = await upsertOutbreakEvent(
              analyzed,
              raw.rawSignalId
            );

            if (eventResult.created) {
              eventsCreated++;
              countryResult.eventsCreated++;
            }

            if (eventResult.updated) {
              eventsUpdated++;
              countryResult.eventsUpdated++;
            }

            countryResult.processed.push({
              rawStatus: analyzed.rawStatus,
              rejectionReason: analyzed.rejectionReason,
              eventCreated: eventResult.created,
              eventUpdated: eventResult.updated,
              city: analyzed.city,
              status: analyzed.eventStatus,
              confirmed: analyzed.confirmedCount,
              suspected: analyzed.suspectedCount,
              monitored: analyzed.monitoredCount,
              deaths: analyzed.deathCount,
              confidence: analyzed.confidenceScore,
              title: analyzed.headline,
              source: analyzed.article.url,
            });
          } catch (error) {
            errorsCount++;
            countryResult.errors.push(getErrorMessage(error));
            await logAgentError(runId, `article:${country.country_name}`, error);
          }
        }

        await markCountryScanned(country.country_name);
      } catch (error) {
        errorsCount++;
        countryResult.errors.push(getErrorMessage(error));
        await logAgentError(runId, `country:${country.country_name}`, error);
      }

      countryResult.durationMs = Date.now() - countryStartedAt;
      countryResults.push(countryResult);
    }

    await finishIngestionRun(
      runId,
      errorsCount > 0 ? "partial_success" : "success",
      {
        sources_checked: sourcesChecked,
        signals_found: rawSignalsInserted,
        signals_inserted: rawSignalsInserted,
        events_created: eventsCreated,
        events_updated: eventsUpdated,
        duplicates_found: duplicatesFound,
        errors_count: errorsCount,
        metadata: {
          rawSignalsInserted,
          reviewSignalsInserted,
          rejectedSignalsInserted,
          candidateSignalsInserted,
          countryResults,
          geocodeRequestsThisRun,
          durationMs: Date.now() - startedAt,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      mode: "global-raw-discovery-and-event-extraction",
      message:
        "Agent finished. It saves relevant articles to raw_signals and creates public/review outbreak events when explicit counts and locations are found.",
      runId,
      seededCountries,
      scannedCountries: countryResults.length,
      sourcesChecked,
      rawSignalsInserted,
      candidateSignalsInserted,
      reviewSignalsInserted,
      rejectedSignalsInserted,
      eventsCreated,
      eventsUpdated,
      duplicatesFound,
      errorsCount,
      geocodeRequestsThisRun,
      countryResults,
      durationMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    errorsCount++;
    await logAgentError(runId, "fatal", error);

    await finishIngestionRun(runId, "failed", {
      sources_checked: sourcesChecked,
      signals_found: rawSignalsInserted,
      signals_inserted: rawSignalsInserted,
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      duplicates_found: duplicatesFound,
      errors_count: errorsCount,
      metadata: {
        fatalError: getErrorMessage(error),
        countryResults,
        durationMs: Date.now() - startedAt,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        mode: "global-raw-discovery-and-event-extraction",
        error: getErrorMessage(error),
        runId,
        countryResults,
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}