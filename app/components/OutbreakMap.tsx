"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
});

type SignalStatus = "confirmed" | "monitoring" | "suspected" | "death" | "none";

type CityPoint = {
  id: number;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  cases: number;
  suspected: number;
  monitoring: number;
  deaths: number;
  status: SignalStatus;
  source: string;
  lastUpdate: string;
  summary: string;
};

type CountryInfo = {
  country: string;
  cases: number;
  suspected: number;
  monitoring: number;
  deaths: number;
  cities: string[];
  status: SignalStatus;
  source: string;
  summary: string;
};

const outbreakSource = "Manual verified outbreak update";

const fallbackCities: CityPoint[] = [
  {
    id: 1,
    city: "Zurich",
    country: "Switzerland",
    region: "Zurich",
    lat: 47.3769,
    lng: 8.5417,
    cases: 1,
    suspected: 0,
    monitoring: 0,
    deaths: 0,
    status: "confirmed",
    source: outbreakSource,
    lastUpdate: "2026-05-10",
    summary:
      "Confirmed travel-related hantavirus case connected with cruise-ship outbreak.",
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
  const clean = String(name || "").trim().toLowerCase();

  const aliases: Record<string, string> = {
    "united kingdom": "United Kingdom",
    england: "United Kingdom",
    "great britain": "United Kingdom",
    britain: "United Kingdom",
    uk: "United Kingdom",

    "united states of america": "United States",
    "united states": "United States",
    usa: "United States",
    us: "United States",

    schweiz: "Switzerland",
    suisse: "Switzerland",
    svizzera: "Switzerland",
    svizra: "Switzerland",
    "schweiz/suisse/svizzera/svizra": "Switzerland",

    holland: "Netherlands",
    "the netherlands": "Netherlands",
    netherlands: "Netherlands",

    "south africa": "South Africa",
    rpa: "South Africa",

    germany: "Germany",
    niemcy: "Germany",

    spain: "Spain",
    hiszpania: "Spain",

    argentina: "Argentina",
    argentyna: "Argentina",

    "russian federation": "Russia",
  };

  return aliases[clean] || String(name || "Unknown country").trim();
}

function cleanCityName(city: string, country: string, region: string) {
  const rawCity = String(city || "").trim();
  const normalizedCountry = normalizeCountryName(country);

  if (!rawCity) {
    return "Unknown city";
  }

  const badCityNames = [
    normalizedCountry.toLowerCase(),
    `${normalizedCountry}, ${normalizedCountry}`.toLowerCase(),
    "schweiz/suisse/svizzera/svizra",
  ];

  if (badCityNames.includes(rawCity.toLowerCase())) {
    if (region && region !== "Unknown region") {
      return region;
    }

    return normalizedCountry;
  }

  if (rawCity.toLowerCase() === "united kingdom") {
    return "Tristan da Cunha";
  }

  return rawCity;
}

function getFeatureName(feature: object) {
  const props =
    "properties" in feature &&
    feature.properties !== null &&
    typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : {};

  const rawName =
    props.ADMIN ??
    props.NAME ??
    props.name ??
    props.country ??
    "Unknown country";

  return normalizeCountryName(String(rawName));
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanStatus(value: unknown, deaths = 0): SignalStatus {
  const status = String(value || "").trim().toLowerCase();

  if (deaths > 0 && status !== "confirmed") {
    return "death";
  }

  if (
    status === "confirmed" ||
    status === "monitoring" ||
    status === "suspected" ||
    status === "death" ||
    status === "none"
  ) {
    return status;
  }

  return "monitoring";
}

function hasSignal(city: CityPoint) {
  return (
    city.cases > 0 ||
    city.suspected > 0 ||
    city.monitoring > 0 ||
    city.deaths > 0 ||
    city.status === "confirmed" ||
    city.status === "suspected" ||
    city.status === "monitoring" ||
    city.status === "death"
  );
}

function getStatusPriority(status: SignalStatus) {
  if (status === "death") return 5;
  if (status === "confirmed") return 4;
  if (status === "suspected") return 3;
  if (status === "monitoring") return 2;
  return 1;
}

function buildCountries(cities: CityPoint[]): CountryInfo[] {
  const map = new Map<string, CountryInfo>();

  for (const city of cities.filter(hasSignal)) {
    const key = normalizeCountryName(city.country);

    if (!map.has(key)) {
      map.set(key, {
        country: key,
        cases: 0,
        suspected: 0,
        monitoring: 0,
        deaths: 0,
        cities: [],
        status: city.status,
        source: city.source,
        summary: `${key} currently has hantavirus signal data stored in this app database.`,
      });
    }

    const item = map.get(key)!;

    item.cases += city.cases;
    item.suspected += city.suspected;
    item.monitoring += city.monitoring;
    item.deaths += city.deaths;

    if (!item.cities.includes(city.city)) {
      item.cities.push(city.city);
    }

    if (getStatusPriority(city.status) > getStatusPriority(item.status)) {
      item.status = city.status;
    }
  }

  return Array.from(map.values());
}

function mapApiCity(item: Record<string, unknown>, index: number): CityPoint {
  const deaths = toNumber(item.deaths, 0);
  const cases = toNumber(item.cases, 0);
  const suspected = toNumber(item.suspected ?? item.suspected_cases, 0);
  const monitoring = toNumber(item.monitoring ?? item.monitoring_cases, 0);

  const country = normalizeCountryName(String(item.country ?? "Unknown country"));
  const region = String(item.region ?? item.admin1 ?? "Unknown region");

  const city = cleanCityName(
    String(item.city ?? item.location ?? "Unknown city"),
    country,
    region
  );

  const status = cleanStatus(item.status ?? item.signal_type, deaths);

  return {
    id: toNumber(item.id, index + 1),
    city,
    country,
    region,
    lat: toNumber(item.lat, 0),
    lng: toNumber(item.lng, 0),
    cases,
    suspected,
    monitoring,
    deaths,
    status,
    source: String(item.source ?? item.source_name ?? outbreakSource),
    lastUpdate: String(
      item.lastUpdate ?? item.last_update ?? item.last_update_date ?? "Unknown"
    ),
    summary: String(item.summary ?? item.raw_summary ?? "Stored hantavirus signal."),
  };
}

export default function OutbreakMap() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);

  const [countries, setCountries] = useState<object[]>([]);
  const [globeSize, setGlobeSize] = useState({
    width: 900,
    height: 900,
  });

  const [trackedCities, setTrackedCities] = useState<CityPoint[]>(fallbackCities);
  const [selectedCity, setSelectedCity] = useState<CityPoint | null>(fallbackCities[0]);
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
    return trackedCities.filter(hasSignal);
  }, [trackedCities]);

  const stats = useMemo(() => {
    return {
      activeSignals: activeCities.length,
      countries: infectedCountries.length,
      trackedCities: activeCities.length,
      totalCases: activeCities.reduce((sum, city) => sum + city.cases, 0),
      totalSuspected: activeCities.reduce((sum, city) => sum + city.suspected, 0),
      totalMonitoring: activeCities.reduce((sum, city) => sum + city.monitoring, 0),
      totalDeaths: activeCities.reduce((sum, city) => sum + city.deaths, 0),
    };
  }, [activeCities, infectedCountries]);

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

    if (country.status === "death" || country.status === "confirmed") {
      return "rgba(255, 23, 50, 0.58)";
    }

    if (country.status === "suspected") {
      return "rgba(255, 154, 190, 0.55)";
    }

    if (country.status === "monitoring") {
      return "rgba(255, 176, 32, 0.44)";
    }

    return "rgba(255,255,255,0.012)";
  }

  function getCountryStroke(countryName: string) {
    const country = findCountryInfo(countryName);

    if (!country) {
      return "rgba(255,255,255,0.22)";
    }

    if (country.status === "death" || country.status === "confirmed") {
      return "rgba(255, 23, 50, 0.95)";
    }

    if (country.status === "suspected") {
      return "rgba(255, 154, 190, 0.98)";
    }

    if (country.status === "monitoring") {
      return "rgba(255, 176, 32, 0.95)";
    }

    return "rgba(255,255,255,0.22)";
  }

  function getCountryAltitude(countryName: string) {
    const country = findCountryInfo(countryName);

    if (!country) {
      return 0.0015;
    }

    if (country.status === "death" || country.status === "confirmed") {
      return 0.006;
    }

    if (country.status === "suspected") {
      return 0.0045;
    }

    if (country.status === "monitoring") {
      return 0.004;
    }

    return 0.0015;
  }

  function getCityMarkerColor(city: CityPoint) {
    if (city.status === "death" || city.deaths > 0) {
      return "#a40018";
    }

    if (city.status === "confirmed") {
      return "#ff1732";
    }

    if (city.status === "suspected") {
      return "#ff9abe";
    }

    if (city.status === "monitoring") {
      return "#ffb020";
    }

    return "#777";
  }

  function handleCountryClick(feature: object) {
    const name = getFeatureName(feature);
    const infectedInfo = findCountryInfo(name);

    if (infectedInfo) {
      setSelectedCountry(infectedInfo);
      setSelectedCity(null);
      return;
    }

    setSelectedCountry({
      country: name,
      cases: 0,
      suspected: 0,
      monitoring: 0,
      deaths: 0,
      cities: [],
      status: "none",
      source: "No verified active signal currently entered for this country.",
      summary:
        "No verified active hantavirus signal is currently entered for this country in this app database.",
    });

    setSelectedCity(null);
  }

  function handleCityClick(city: CityPoint) {
    setSelectedCity(city);
    setSelectedCountry(findCountryInfo(city.country) || null);
  }

  function getTabTitle() {
    const item = navItems.find((nav) => nav.id === activeTab);
    return item ? `${item.icon} ${item.label}` : "SECTION";
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
          const mapped = rawCities
            .map((item: unknown, index: number) =>
              mapApiCity(
                item !== null && typeof item === "object"
                  ? (item as Record<string, unknown>)
                  : {},
                index
              )
            )
            .filter((city) => {
            if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) {
              return false;
            }

            if (city.lat === 0 && city.lng === 0) {
              return false;
            }

            return true;
          });

          setTrackedCities(mapped);
          setSelectedCity(mapped.find(hasSignal) || mapped[0] || null);

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

      if (!box) {
        return;
      }

      const isMobile = window.innerWidth <= 768;
      const boxWidth = box.clientWidth;
      const boxHeight = box.clientHeight;

      if (isMobile) {
        const size = Math.floor(Math.min(boxWidth, boxHeight));

        setGlobeSize({
          width: size,
          height: size,
        });

        return;
      }

      setGlobeSize({
        width: Math.floor(boxWidth),
        height: Math.floor(boxHeight),
      });
    }

    updateGlobeSize();

    const timeoutOne = window.setTimeout(updateGlobeSize, 100);
    const timeoutTwo = window.setTimeout(updateGlobeSize, 500);

    const observer = new ResizeObserver(() => {
      updateGlobeSize();
    });

    if (globeWrapRef.current) {
      observer.observe(globeWrapRef.current);
    }

    window.addEventListener("resize", updateGlobeSize);

    return () => {
      window.clearTimeout(timeoutOne);
      window.clearTimeout(timeoutTwo);
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
      controls.minDistance = 140;
      controls.maxDistance = 1200;
    }

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      globeRef.current.pointOfView(
        {
          lat: 32,
          lng: 8,
          altitude: 4.25,
        },
        900
      );
    } else {
      globeRef.current.pointOfView(
        {
          lat: 32,
          lng: -18,
          altitude: 2.35,
        },
        1100
      );
    }
  }, [globeSize.width, globeSize.height, countries.length]);

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
              polygonCapColor={(feature: object) =>
                getCountryColor(getFeatureName(feature))
              }
              polygonSideColor={(feature: object) =>
                getCountryColor(getFeatureName(feature)).replace("0.58", "0.12")
              }
              polygonStrokeColor={(feature: object) =>
                getCountryStroke(getFeatureName(feature))
              }
              polygonAltitude={(feature: object) =>
                getCountryAltitude(getFeatureName(feature))
              }
              polygonLabel={() => ""}
              onPolygonClick={handleCountryClick}
              pointsData={activeCities}
              pointLat="lat"
              pointLng="lng"
              pointAltitude={0.004}
              pointRadius={0.055}
              pointResolution={24}
              pointColor={(city: object) => getCityMarkerColor(city as CityPoint)}
              pointLabel={(city: object) => {
                const item = city as CityPoint;
                return `${item.city}, ${item.country}`;
              }}
              onPointClick={(city: object) => handleCityClick(city as CityPoint)}
              ringsData={activeCities}
              ringLat="lat"
              ringLng="lng"
              ringAltitude={0.005}
              ringColor={(city: object) => {
                const item = city as CityPoint;
                const color = getCityMarkerColor(item);

                if (color === "#ff9abe") return "rgba(255,154,190,0.45)";
                if (color === "#ffb020") return "rgba(255,176,32,0.45)";
                if (color === "#a40018") return "rgba(164,0,24,0.45)";

                return "rgba(255,23,50,0.45)";
              }}
              ringMaxRadius={0.9}
              ringPropagationSpeed={0.45}
              ringRepeatPeriod={1700}
              arcsData={[]}
              labelsData={[]}
              htmlElementsData={[]}
            />
          </div>
        </div>

        <div className="radar-header">
          <h1>
            Hantavirus <span>Radar</span>
          </h1>

          <p>
            Verified country overlays and clickable outbreak markers. Click any
            country to view country statistics.
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
            <span className="dot red"></span> Confirmed / death signal
          </div>

          <div>
            <span className="dot pink"></span> Suspected signal
          </div>

          <div>
            <span className="dot orange"></span> Monitoring signal
          </div>

          <div>
            <span className="dot gray"></span> No verified data
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

              <div className="details-grid four">
                <div>
                  <small>Cases</small>
                  <strong>{selectedCity.cases}</strong>
                </div>

                <div>
                  <small>Suspected</small>
                  <strong>{selectedCity.suspected}</strong>
                </div>

                <div>
                  <small>Monitoring</small>
                  <strong>{selectedCity.monitoring}</strong>
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

              <div className="details-grid four">
                <div>
                  <small>Cases</small>
                  <strong>{selectedCountry.cases}</strong>
                </div>

                <div>
                  <small>Suspected</small>
                  <strong>{selectedCountry.suspected}</strong>
                </div>

                <div>
                  <small>Monitoring</small>
                  <strong>{selectedCountry.monitoring}</strong>
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
            <small>all stored signals</small>
          </div>

          <div className="radar-stat">
            <span>🌎</span>
            <strong>{stats.countries}</strong>
            <p>COUNTRIES</p>
            <small>with stored signals</small>
          </div>

          <div className="radar-stat">
            <span>🏙️</span>
            <strong>{stats.trackedCities}</strong>
            <p>TRACKED CITIES</p>
            <small>clickable map dots</small>
          </div>

          <div className="radar-stat">
            <span>🗓️</span>
            <strong>Live</strong>
            <p>LAST REFRESH</p>
            <small>{lastRefresh}</small>
          </div>

          <div className="radar-feed">
            <b>• LIVE FEED</b>
            Supabase source monitoring active. Click any dot or country to view
            details.
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
                Get notified when a new verified hantavirus signal appears in the
                database.
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
          title="Current app data"
          body={[
            `Stored signals: ${trackedCities.filter(hasSignal).length}`,
            `Countries with stored signals: ${infectedCountries.length}`,
            `Total confirmed cases: ${trackedCities.reduce(
              (sum, city) => sum + city.cases,
              0
            )}`,
            `Total suspected: ${trackedCities.reduce(
              (sum, city) => sum + city.suspected,
              0
            )}`,
            `Total monitoring: ${trackedCities.reduce(
              (sum, city) => sum + city.monitoring,
              0
            )}`,
            `Total deaths: ${trackedCities.reduce(
              (sum, city) => sum + city.deaths,
              0
            )}`,
          ]}
        />

        <InfoCard
          title="Data rule"
          body={[
            "Confirmed cases, suspected cases, deaths and monitoring/exposure locations are separated by status.",
            "The app should never invent numbers without a stored database signal.",
            "Country color follows the strongest stored status: death, confirmed, suspected, monitoring.",
          ]}
        />

        <InfoCard
          title="Countries currently tracked"
          body={infectedCountries.map(
            (country) =>
              `${country.country}: ${country.cases} confirmed, ${country.suspected} suspected, ${country.monitoring} monitoring, ${country.deaths} deaths, status: ${country.status}`
          )}
        />
      </div>
    );
  }

  if (activeTab === "signals") {
    return (
      <div className="info-grid">
        {trackedCities.filter(hasSignal).map((city) => (
          <InfoCard
            key={city.id}
            title={`${city.city}, ${city.country}`}
            body={[
              `Confirmed cases: ${city.cases}`,
              `Suspected: ${city.suspected}`,
              `Monitoring: ${city.monitoring}`,
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
            "Verified news reports only when official location data is incomplete",
          ]}
        />

        <InfoCard
          title="Source rules"
          body={[
            "No country should be colored without a stored signal.",
            "Every number must have a date.",
            "Every city marker must have a source.",
            "Suspicion, monitoring, confirmed cases and deaths should not be mixed together.",
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
            "A country shows red only when this app database has a confirmed or death signal for that country.",
            "Suspected signals are pink.",
            "Monitoring signals are orange.",
          ]}
        />

        <InfoCard
          title="Why does a country show pink?"
          body={[
            "Pink means suspected signal.",
            "It does not mean confirmed cases.",
            "It also does not mean the whole country is broadly infected.",
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