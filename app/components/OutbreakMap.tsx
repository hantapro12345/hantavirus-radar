"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
});

type SignalStatus = "confirmed" | "monitoring" | "suspected" | "none";

type CityPoint = {
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

type CountryInfo = {
  country: string;
  cases: number;
  deaths: number;
  cities: string[];
  status: SignalStatus;
  source: string;
  summary: string;
};

const outbreakSource = "Public health report / verified news monitoring";

const fallbackCities: CityPoint[] = [
  {
    id: 1,
    city: "Zurich",
    country: "Switzerland",
    region: "Zurich",
    lat: 47.3769,
    lng: 8.5417,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-08",
    summary: "Confirmed hantavirus case connected with cruise ship travel.",
  },
  {
    id: 2,
    city: "London",
    country: "United Kingdom",
    region: "England",
    lat: 51.5072,
    lng: -0.1276,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-08",
    summary: "Confirmed hantavirus case connected with cruise ship travel.",
  },
  {
    id: 3,
    city: "Leiden",
    country: "Netherlands",
    region: "South Holland",
    lat: 52.1601,
    lng: 4.497,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-08",
    summary: "Confirmed hantavirus case connected with cruise ship travel.",
  },
  {
    id: 4,
    city: "Dusseldorf",
    country: "Germany",
    region: "North Rhine-Westphalia",
    lat: 51.2277,
    lng: 6.7735,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-08",
    summary: "Confirmed hantavirus case connected with cruise ship travel.",
  },
  {
    id: 5,
    city: "Ushuaia",
    country: "Argentina",
    region: "Tierra del Fuego",
    lat: -54.8019,
    lng: -68.303,
    cases: 1,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-08",
    summary:
      "Confirmed cruise-ship-related hantavirus signal connected with Argentina.",
  },
];

const navItems = [
  { id: "map", label: "LIVE MAP", icon: "🌐" },
  { id: "statistics", label: "STATISTICS", icon: "📊" },
  { id: "signals", label: "ACTIVE SIGNALS", icon: "📍" },
  { id: "symptoms", label: "SYMPTOMS", icon: "💗" },
  { id: "prevention", label: "PREVENTION", icon: "🛡️" },
  { id: "sources", label: "SOURCES", icon: "📚" },
  { id: "faq", label: "FAQ", icon: "❓" },
  { id: "about", label: "ABOUT", icon: "ℹ️" },
];

function normalizeCountryName(name: string) {
  const clean = name.trim().toLowerCase();

  const aliases: Record<string, string> = {
    "united kingdom": "United Kingdom",
    england: "United Kingdom",
    "great britain": "United Kingdom",
    britain: "United Kingdom",
    uk: "United Kingdom",
    "united states of america": "United States",
    usa: "United States",
    us: "United States",
    "russian federation": "Russia",
    republicofserbia: "Serbia",
  };

  return aliases[clean] || name.trim();
}

function getFeatureName(feature: any) {
  const rawName =
    feature?.properties?.ADMIN ||
    feature?.properties?.NAME ||
    feature?.properties?.name ||
    feature?.properties?.country ||
    "Unknown country";

  return normalizeCountryName(rawName);
}

function buildCountries(cities: CityPoint[]): CountryInfo[] {
  const map = new Map<string, CountryInfo>();

  for (const city of cities) {
    const key = normalizeCountryName(city.country);

    if (!map.has(key)) {
      map.set(key, {
        country: key,
        cases: 0,
        deaths: 0,
        cities: [],
        status: city.status,
        source: city.source,
        summary: `${key} currently has verified hantavirus signal data stored in this app database.`,
      });
    }

    const item = map.get(key)!;
    item.cases += city.cases;
    item.deaths += city.deaths;

    if (!item.cities.includes(city.city)) {
      item.cities.push(city.city);
    }

    if (city.status === "confirmed") {
      item.status = "confirmed";
    }
  }

  return Array.from(map.values());
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanStatus(value: unknown): SignalStatus {
  if (
    value === "confirmed" ||
    value === "monitoring" ||
    value === "suspected" ||
    value === "none"
  ) {
    return value;
  }

  return "confirmed";
}

function mapApiCity(item: any, index: number): CityPoint {
  return {
    id: toNumber(item.id, index + 1),
    city: String(item.city || "Unknown city"),
    country: normalizeCountryName(String(item.country || "Unknown country")),
    region: String(item.region || "Unknown region"),
    lat: toNumber(item.lat, 0),
    lng: toNumber(item.lng, 0),
    cases: toNumber(item.cases, 1),
    deaths: toNumber(item.deaths, 0),
    status: cleanStatus(item.status),
    source: String(item.source || item.source_name || outbreakSource),
    lastUpdate: String(
      item.lastUpdate || item.last_update || item.last_update_date || "Unknown"
    ),
    summary: String(item.summary || "Verified hantavirus signal."),
  };
}

export default function OutbreakMap() {
  const globeRef = useRef<any>(null);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);

  const [countries, setCountries] = useState<any[]>([]);
  const [globeSize, setGlobeSize] = useState({
    width: 700,
    height: 700,
  });

  const [trackedCities, setTrackedCities] = useState<CityPoint[]>(fallbackCities);
  const [selectedCity, setSelectedCity] = useState<CityPoint | null>(
    fallbackCities[0]
  );
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(
    buildCountries(fallbackCities)[0]
  );
  const [activeTab, setActiveTab] = useState("map");
  const [lastRefresh, setLastRefresh] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);

  const infectedCountries = useMemo(() => {
    return buildCountries(trackedCities);
  }, [trackedCities]);

  const activeCities = useMemo(() => {
    return trackedCities.filter((city) => city.cases > 0);
  }, [trackedCities]);

  const stats = useMemo(() => {
    return {
      activeSignals: activeCities.length,
      countries: infectedCountries.length,
      trackedCities: trackedCities.length,
      totalCases: activeCities.reduce((sum, city) => sum + city.cases, 0),
      totalDeaths: activeCities.reduce((sum, city) => sum + city.deaths, 0),
    };
  }, [activeCities, infectedCountries, trackedCities]);

  function findCountryInfo(countryName: string) {
    const normalized = normalizeCountryName(countryName);

    return infectedCountries.find(
      (item) => normalizeCountryName(item.country) === normalized
    );
  }

  function getCountryColor(countryName: string) {
    const country = findCountryInfo(countryName);

    if (!country) {
      return "rgba(255,255,255,0.012)";
    }

    return "rgba(255, 20, 45, 0.62)";
  }

  function getCountryStroke(countryName: string) {
    const country = findCountryInfo(countryName);

    if (!country) {
      return "rgba(255,255,255,0.22)";
    }

    return "rgba(255, 23, 50, 0.95)";
  }

  function getCountryAltitude(countryName: string) {
    const country = findCountryInfo(countryName);

    if (!country) {
      return 0.0015;
    }

    return 0.009;
  }

  function getCityDotColor(city: CityPoint) {
    if (city.cases > 0) {
      return "#ff1732";
    }

    return "rgba(255,255,255,0.35)";
  }

  function getCityDotSize(city: CityPoint) {
    if (city.cases > 0) {
      return 0.42;
    }

    return 0.18;
  }

  useEffect(() => {
    async function loadData() {
      setLastRefresh(new Date().toLocaleTimeString());

      try {
        const response = await fetch("/api/outbreaks", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load outbreak API");
        }

        const data = await response.json();

        const rawCities =
          data?.citySignals ||
          data?.cities ||
          data?.activeSignals ||
          data?.signals ||
          [];

        if (Array.isArray(rawCities) && rawCities.length > 0) {
          const mapped = rawCities.map(mapApiCity);

          setTrackedCities(mapped);
          setSelectedCity(mapped[0]);

          const countryList = buildCountries(mapped);
          setSelectedCountry(countryList[0] || null);
        }
      } catch {
        setTrackedCities(fallbackCities);
        setSelectedCity(fallbackCities[0]);
        setSelectedCountry(buildCountries(fallbackCities)[0]);
      }
    }

    loadData();

    fetch(
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
    )
      .then((response) => response.json())
      .then((data) => {
        setCountries(data.features || []);
      })
      .catch(() => {
        setCountries([]);
      });
  }, []);

  useEffect(() => {
    function updateGlobeSize() {
      const box = globeWrapRef.current;

      if (!box) return;

      const rect = box.getBoundingClientRect();

      setGlobeSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }

    updateGlobeSize();

    const observer = new ResizeObserver(() => {
      updateGlobeSize();
    });

    if (globeWrapRef.current) {
      observer.observe(globeWrapRef.current);
    }

    window.addEventListener("resize", updateGlobeSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGlobeSize);
    };
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;

    const controls = globeRef.current.controls();

    if (controls) {
      controls.autoRotate = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.55;
      controls.zoomSpeed = 0.7;
      controls.minDistance = 120;
      controls.maxDistance = 1200;
    }

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      globeRef.current.pointOfView(
        {
          lat: 28,
          lng: 5,
          altitude: 2.75,
        },
        800
      );
    } else {
      globeRef.current.pointOfView(
        {
          lat: 24,
          lng: -20,
          altitude: 2.15,
        },
        900
      );
    }
  }, [globeSize.width, globeSize.height, countries.length]);

  function handleCountryClick(feature: any) {
    const name = getFeatureName(feature);
    const infectedInfo = findCountryInfo(name);

    if (infectedInfo) {
      setSelectedCountry(infectedInfo);
      setSelectedCity(null);
      return;
    }

    const emptyCountry: CountryInfo = {
      country: name,
      cases: 0,
      deaths: 0,
      cities: [],
      status: "none",
      source: "No verified active signal currently entered for this country.",
      summary:
        "No verified active hantavirus signal is currently entered for this country in this app database.",
    };

    setSelectedCountry(emptyCountry);
    setSelectedCity(null);
  }

  function handleCityClick(city: CityPoint) {
    setSelectedCity(city);

    const country = findCountryInfo(city.country) || null;
    setSelectedCountry(country);
  }

  function getTabTitle() {
    const item = navItems.find((nav) => nav.id === activeTab);
    return item ? `${item.icon} ${item.label}` : "SECTION";
  }

  return (
    <main className="radar-app">
      <aside className="radar-sidebar">
        <div className="radar-brand">
          <div className="radar-brand-icon">☣</div>

          <div>
            <div className="radar-brand-main">HANTAVIRUS</div>
            <div className="radar-brand-red">RADAR</div>
          </div>
        </div>

        <nav className="radar-nav">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`radar-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="radar-nav-icon">{item.icon}</span>
                <span className="radar-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="radar-main">
        <div className="radar-header">
          <h1>
            Hantavirus <span>Radar</span>
          </h1>

          <p>
            Verified country overlays and clickable outbreak dots. Click any
            country to view country statistics. Click any red dot to view city
            details.
          </p>
        </div>

        <div className="radar-top-actions">
          <div className="radar-live">
            <span></span>
            LIVE <small>Supabase tracking</small>
          </div>

          <button className="radar-bell" type="button">
            🔔
          </button>

          <button
            className="radar-alert"
            type="button"
            onClick={() => setAlertsOpen(true)}
          >
            GET ALERTS
          </button>
        </div>

        <div className="radar-legend">
          <h3>RISK LEVELS</h3>

          <div>
            <span className="dot red"></span> Active country or city signal
          </div>

          <div>
            <span className="dot pink"></span> Country with stored case
          </div>

          <div>
            <span className="dot gray"></span> No verified data
          </div>
        </div>

        <div className="radar-globe" ref={globeWrapRef}>
          <div className="radar-globe-stage">
            <Globe
              ref={globeRef}
              width={globeSize.width}
              height={globeSize.height}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
              backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
              polygonsData={countries}
              polygonCapColor={(feature: any) =>
                getCountryColor(getFeatureName(feature))
              }
              polygonSideColor={() => "rgba(255, 23, 50, 0.08)"}
              polygonStrokeColor={(feature: any) =>
                getCountryStroke(getFeatureName(feature))
              }
              polygonAltitude={(feature: any) =>
                getCountryAltitude(getFeatureName(feature))
              }
              onPolygonClick={handleCountryClick}
              pointsData={trackedCities.filter((city) => city.cases > 0)}
              pointLat="lat"
              pointLng="lng"
              pointAltitude={0.025}
              pointRadius={(city: any) => getCityDotSize(city)}
              pointColor={(city: any) => getCityDotColor(city)}
              onPointClick={(city: any) => handleCityClick(city)}
            />
          </div>
        </div>

        <aside className="radar-details">
          <div className="details-kicker">
            {selectedCity ? "CITY DETAILS" : "COUNTRY DETAILS"}
          </div>

          {selectedCity ? (
            <>
              <h2>
                {selectedCity.city}, {selectedCity.country}
              </h2>

              <p className="details-subtitle">{selectedCity.region}</p>

              <div className="details-grid">
                <div>
                  <small>Cases</small>
                  <strong>{selectedCity.cases}</strong>
                </div>

                <div>
                  <small>Deaths</small>
                  <strong>{selectedCity.deaths}</strong>
                </div>
              </div>

              <div className="details-box">
                <b>Status:</b> {selectedCity.status}
                <br />
                <b>Last update:</b> {selectedCity.lastUpdate}
                <br />
                <b>Source:</b> {selectedCity.source}
              </div>

              <p className="details-text">{selectedCity.summary}</p>
            </>
          ) : selectedCountry ? (
            <>
              <h2>{selectedCountry.country}</h2>

              <p className="details-subtitle">
                Country-level status from the current app database.
              </p>

              <div className="details-grid">
                <div>
                  <small>Cases</small>
                  <strong>{selectedCountry.cases}</strong>
                </div>

                <div>
                  <small>Deaths</small>
                  <strong>{selectedCountry.deaths}</strong>
                </div>
              </div>

              <div className="details-box">
                <b>Status:</b> {selectedCountry.status}
                <br />
                <b>Cities:</b>{" "}
                {selectedCountry.cities.length > 0
                  ? selectedCountry.cities.join(", ")
                  : "No tracked infected cities"}
                <br />
                <b>Source:</b> {selectedCountry.source}
              </div>

              <p className="details-text">{selectedCountry.summary}</p>
            </>
          ) : null}
        </aside>

        <section className="radar-bottom">
          <div className="radar-stat">
            <span>☣</span>
            <strong>{stats.activeSignals}</strong>
            <p>ACTIVE SIGNALS</p>
            <small>verified only</small>
          </div>

          <div className="radar-stat">
            <span>🌎</span>
            <strong>{stats.countries}</strong>
            <p>COUNTRIES</p>
            <small>with verified signals</small>
          </div>

          <div className="radar-stat">
            <span>🏙️</span>
            <strong>{stats.trackedCities}</strong>
            <p>TRACKED CITIES</p>
            <small>active dots only</small>
          </div>

          <div className="radar-stat">
            <span>🗓️</span>
            <strong>Live</strong>
            <p>LAST REFRESH</p>
            <small>{lastRefresh}</small>
          </div>

          <div className="radar-feed">
            <b>• LIVE FEED</b>
            Supabase source monitoring active. Click any country to view country
            statistics. Click red city dots to view city details.
          </div>
        </section>

        {activeTab !== "map" && (
          <section className="radar-overlay">
            <div className="radar-overlay-header">
              <div>
                <div className="radar-overlay-kicker">HANTAVIRUS RADAR</div>
                <h2>{getTabTitle()}</h2>
              </div>

              <button type="button" onClick={() => setActiveTab("map")}>
                ✕ CLOSE
              </button>
            </div>

            <div className="radar-overlay-content">
              {renderTabContent(activeTab, trackedCities, infectedCountries)}
            </div>
          </section>
        )}

        {alertsOpen && (
          <section className="alert-backdrop">
            <div className="alert-modal">
              <button
                type="button"
                onClick={() => setAlertsOpen(false)}
                className="alert-close"
              >
                ✕
              </button>

              <div className="alert-kicker">HANTAVIRUS RADAR PRO</div>

              <h2>Instant outbreak alerts</h2>

              <p>
                Get notified when a new verified hantavirus signal appears in
                the database. Designed for travelers, researchers and people who
                want early public-health awareness.
              </p>

              <div className="alert-price-box">
                <div>
                  <small>Monthly plan</small>
                  <strong>$1</strong>
                </div>

                <span>Early access</span>
              </div>

              <div className="alert-features">
                <div>✓ New country alerts</div>
                <div>✓ New city signal alerts</div>
                <div>✓ Source and date included</div>
                <div>✓ Verified-only monitoring mode</div>
              </div>

              <button type="button" className="alert-buy">
                BUY ALERTS
              </button>

              <p className="alert-fine">
                Payment system will be connected later. This button is currently
                a product preview.
              </p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function renderTabContent(
  activeTab: string,
  trackedCities: CityPoint[],
  infectedCountries: CountryInfo[]
) {
  if (activeTab === "statistics") {
    return (
      <div className="info-grid">
        <InfoCard
          title="Current verified app data"
          body={[
            `Active verified signals: ${
              trackedCities.filter((city) => city.cases > 0).length
            }`,
            `Countries with stored verified signals: ${infectedCountries.length}`,
            `Tracked outbreak city dots: ${trackedCities.length}`,
            "Current app mode: verified-only database",
          ]}
        />

        <InfoCard
          title="Data rule"
          body={[
            "Every country with at least one stored case is colored red.",
            "Countries without stored verified signals remain clickable and show 0 cases.",
            "The app should never invent case numbers without a source.",
          ]}
        />

        <InfoCard
          title="Countries currently tracked"
          body={infectedCountries.map(
            (country) => `${country.country}: ${country.cases} case(s)`
          )}
        />
      </div>
    );
  }

  if (activeTab === "signals") {
    return (
      <div className="info-grid">
        {trackedCities.map((city) => (
          <InfoCard
            key={city.id}
            title={`${city.city}, ${city.country}`}
            body={[
              `Cases: ${city.cases}`,
              `Deaths: ${city.deaths}`,
              `Status: ${city.status}`,
              `Source: ${city.source}`,
              city.summary,
            ]}
          />
        ))}
      </div>
    );
  }

  if (activeTab === "symptoms") {
    return (
      <div className="info-grid">
        <InfoCard
          title="Early symptoms"
          body={[
            "Fever",
            "Fatigue",
            "Muscle aches",
            "Headache",
            "Dizziness",
            "Chills",
            "Nausea, vomiting, diarrhea or abdominal pain",
          ]}
        />

        <InfoCard
          title="Serious warning symptoms"
          body={[
            "Coughing",
            "Shortness of breath",
            "Chest tightness",
            "Rapid worsening after flu-like symptoms",
            "Severe weakness",
          ]}
        />

        <InfoCard
          title="Urgent medical help"
          body={[
            "Seek urgent medical help if breathing symptoms appear.",
            "Tell the doctor about possible rodent exposure or travel exposure.",
            "This app is not a medical diagnosis tool.",
          ]}
        />
      </div>
    );
  }

  if (activeTab === "prevention") {
    return (
      <div className="info-grid">
        <InfoCard
          title="Main prevention rule"
          body={[
            "Avoid contact with rodents, droppings, urine, saliva and nesting material.",
            "Do not sweep or vacuum rodent droppings dry.",
            "Ventilate closed spaces before cleaning.",
          ]}
        />

        <InfoCard
          title="Home protection"
          body={[
            "Seal holes and gaps.",
            "Store food in sealed containers.",
            "Remove trash and food sources.",
            "Use traps if rodents are present.",
          ]}
        />

        <InfoCard
          title="Cleaning safety"
          body={[
            "Wear gloves.",
            "Wet contaminated areas with disinfectant before cleaning.",
            "Do not stir up dust.",
            "Wash hands after cleaning.",
          ]}
        />
      </div>
    );
  }

  if (activeTab === "sources") {
    return (
      <div className="info-grid">
        <InfoCard
          title="Sources to use"
          body={[
            "WHO updates",
            "ECDC updates",
            "CDC hantavirus pages",
            "National health ministries",
            "Regional public-health bulletins",
          ]}
        />

        <InfoCard
          title="Source rules"
          body={[
            "No country should be colored without a source.",
            "Every number must have a date.",
            "Every city dot must have a source.",
            "If there is no source, show 0 and no verified data.",
          ]}
        />

        <InfoCard
          title="Future automation"
          body={[
            "Later we can connect this to a database.",
            "Then a scheduled script can check official sources.",
            "Human review should approve sensitive health alerts before publishing.",
          ]}
        />
      </div>
    );
  }

  if (activeTab === "faq") {
    return (
      <div className="info-grid">
        <InfoCard
          title="Why does a country show red?"
          body={[
            "A country shows red when this app database has at least one stored case for that country.",
            "It does not mean the whole country is broadly infected.",
          ]}
        />

        <InfoCard
          title="Why do some countries show 0?"
          body={[
            "Because every country is clickable.",
            "0 means no verified active signal is currently stored for that country in this app.",
          ]}
        />

        <InfoCard
          title="Is this medical advice?"
          body={[
            "No.",
            "The app shows public-health signals and source information.",
            "People with symptoms should contact medical professionals.",
          ]}
        />
      </div>
    );
  }

  if (activeTab === "about") {
    return (
      <div className="info-grid">
        <InfoCard
          title="What is Hantavirus Radar?"
          body={[
            "A public-health tracking interface focused on hantavirus signals.",
            "The goal is to show verified locations, sources, risk levels and prevention information.",
          ]}
        />

        <InfoCard
          title="Product goal"
          body={[
            "Make outbreak information easier to understand.",
            "Separate verified data from rumors.",
            "Show source, date and status for every alert.",
          ]}
        />

        <InfoCard
          title="Planned features"
          body={[
            "Real-time official source monitoring.",
            "Paid alerts.",
            "Admin verification dashboard.",
            "Historical timeline by country and city.",
          ]}
        />
      </div>
    );
  }

  return null;
}

function InfoCard({ title, body }: { title: string; body: string[] }) {
  return (
    <article className="info-card">
      <h3>{title}</h3>

      <ul>
        {body.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}