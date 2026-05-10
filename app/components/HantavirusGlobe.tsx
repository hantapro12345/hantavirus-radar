"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";

type CountryFeature = {
  type: string;
  properties: {
    ADMIN?: string;
    NAME?: string;
    NAME_LONG?: string;
    ISO_A2?: string;
    ISO_A3?: string;
  };
  geometry: unknown;
};

type CityPoint = {
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  cases: number;
  deaths: number;
  status: "confirmed" | "monitoring" | "suspected" | "none";
  source: string;
  note: string;
};

type SelectedPanel =
  | {
      type: "country";
      name: string;
      cases: number;
      deaths: number;
      status: string;
      source: string;
      note: string;
    }
  | {
      type: "city";
      name: string;
      country: string;
      region: string;
      cases: number;
      deaths: number;
      status: string;
      source: string;
      note: string;
    };

const infectedCountries: Record<
  string,
  {
    cases: number;
    deaths: number;
    status: string;
    source: string;
    note: string;
  }
> = {
  ARG: {
    cases: 1,
    deaths: 0,
    status: "monitoring",
    source:
      "Africa CDC - statement on multi-country hantavirus cluster associated with cruise ship travel",
    note:
      "Verified public-health statement: a multi-country hantavirus cluster is being monitored in relation to cruise ship travel. Departure point included Ushuaia, Argentina. This does not mean the whole country is widely infected.",
  },
};

const outbreakCities: CityPoint[] = [
  {
    name: "Ushuaia",
    country: "Argentina",
    region: "Tierra del Fuego",
    lat: -54.8019,
    lng: -68.303,
    cases: 1,
    deaths: 0,
    status: "monitoring",
    source:
      "Africa CDC - statement on multi-country hantavirus cluster associated with cruise ship travel",
    note:
      "Verified signal connected to a monitored multi-country hantavirus cluster. This is shown as a city-level signal, not a national outbreak.",
  },
];

const menuItems = [
  { icon: "🌐", label: "LIVE MAP" },
  { icon: "📊", label: "STATISTICS" },
  { icon: "📍", label: "ACTIVE SIGNALS" },
  { icon: "💗", label: "SYMPTOMS" },
  { icon: "🛡️", label: "PREVENTION" },
  { icon: "📚", label: "SOURCES" },
  { icon: "❓", label: "FAQ" },
  { icon: "ℹ️", label: "ABOUT" },
];

export default function HantavirusGlobe() {
  const globeRef = useRef<any>(null);

  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [size, setSize] = useState({
    width: 1200,
    height: 900,
  });

  const [selectedPanel, setSelectedPanel] = useState<SelectedPanel>({
    type: "city",
    name: "Ushuaia",
    country: "Argentina",
    region: "Tierra del Fuego",
    cases: 1,
    deaths: 0,
    status: "monitoring",
    source:
      "Africa CDC - statement on multi-country hantavirus cluster associated with cruise ship travel",
    note:
      "Verified public-health statement: a multi-country hantavirus cluster is being monitored in relation to cruise ship travel. Departure point included Ushuaia, Argentina. This does not mean the whole country is widely infected.",
  });

  useEffect(() => {
    function updateSize() {
      setSize({
        width: Math.max(window.innerWidth - 132, 320),
        height: window.innerHeight,
      });
    }

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
    )
      .then((res) => res.json())
      .then((data) => {
        setCountries(data.features || []);
      })
      .catch(() => {
        setCountries([]);
      });
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;

    const controls = globeRef.current.controls();

    controls.autoRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.75;

    globeRef.current.pointOfView(
      {
        lat: -25,
        lng: -55,
        altitude: 1.75,
      },
      900
    );
  }, []);

  const polygonsData = useMemo(() => countries, [countries]);
  const cityPoints = useMemo(() => outbreakCities, []);

  const infectedCountryCount = Object.keys(infectedCountries).length;

  function getCountryName(country: CountryFeature) {
    return (
      country.properties.ADMIN ||
      country.properties.NAME_LONG ||
      country.properties.NAME ||
      "Unknown country"
    );
  }

  function getCountryCode(country: CountryFeature) {
    return country.properties.ISO_A3 || "";
  }

  function getCountryStats(country: CountryFeature) {
    const code = getCountryCode(country);
    return infectedCountries[code];
  }

  function handleCountryClick(country: CountryFeature) {
    const name = getCountryName(country);
    const stats = getCountryStats(country);

    if (stats) {
      setSelectedPanel({
        type: "country",
        name,
        cases: stats.cases,
        deaths: stats.deaths,
        status: stats.status,
        source: stats.source,
        note: stats.note,
      });
    } else {
      setSelectedPanel({
        type: "country",
        name,
        cases: 0,
        deaths: 0,
        status: "no verified data",
        source: "No verified source currently attached to this country.",
        note:
          "This country is clickable for navigation only. No verified hantavirus signal is currently stored in this dataset for this country.",
      });
    }
  }

  function handleCityClick(city: CityPoint) {
    setSelectedPanel({
      type: "city",
      name: city.name,
      country: city.country,
      region: city.region,
      cases: city.cases,
      deaths: city.deaths,
      status: city.status,
      source: city.source,
      note: city.note,
    });
  }

  function createCityMarker(city: CityPoint) {
    const wrapper = document.createElement("div");
    wrapper.className = "city-marker-wrap";

    const marker = document.createElement("div");
    marker.className = `city-marker ${city.status}`;

    const pulse = document.createElement("div");
    pulse.className = "city-marker-pulse";

    const pin = document.createElement("div");
    pin.className = "city-marker-pin";

    const label = document.createElement("div");
    label.className = "city-marker-label";
    label.innerText = city.name;

    marker.appendChild(pulse);
    marker.appendChild(pin);
    marker.appendChild(label);
    wrapper.appendChild(marker);

    wrapper.onclick = (event) => {
      event.stopPropagation();
      handleCityClick(city);
    };

    return wrapper;
  }

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#020611",
        color: "white",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: 132,
          background: "rgba(2, 8, 21, 0.96)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          zIndex: 20,
          padding: "22px 10px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            marginBottom: 34,
            paddingLeft: 4,
            lineHeight: 1.02,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 950,
              letterSpacing: 0.5,
            }}
          >
            ☣ HANTAVIRUS
          </div>

          <div
            style={{
              color: "#ff263d",
              fontSize: 17,
              fontWeight: 950,
              letterSpacing: 0.7,
              marginTop: 4,
            }}
          >
            RADAR
          </div>
        </div>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              style={{
                width: "100%",
                minHeight: 50,
                borderRadius: 15,
                border:
                  index === 0
                    ? "1px solid rgba(255,38,61,0.45)"
                    : "1px solid transparent",
                background:
                  index === 0 ? "rgba(255,38,61,0.16)" : "transparent",
                color: "white",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "0 10px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  width: 18,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>

              <span
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  lineHeight: 1.15,
                  letterSpacing: 0.2,
                }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section
        style={{
          position: "absolute",
          left: 132,
          top: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(24,74,148,0.22), rgba(0,0,0,0.25) 38%, rgba(0,0,0,0.82) 100%)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />

        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          polygonsData={polygonsData}
          polygonAltitude={(country: object) => {
            const c = country as CountryFeature;
            return getCountryStats(c) ? 0.003 : 0.001;
          }}
          polygonCapColor={(country: object) => {
            const c = country as CountryFeature;
            return getCountryStats(c)
              ? "rgba(255, 39, 57, 0.38)"
              : "rgba(255, 255, 255, 0.01)";
          }}
          polygonSideColor={(country: object) => {
            const c = country as CountryFeature;
            return getCountryStats(c)
              ? "rgba(255, 39, 57, 0.08)"
              : "rgba(255, 255, 255, 0.003)";
          }}
          polygonStrokeColor={(country: object) => {
            const c = country as CountryFeature;
            return getCountryStats(c)
              ? "rgba(255, 39, 57, 0.95)"
              : "rgba(255,255,255,0.24)";
          }}
          polygonLabel={() => ""}
          onPolygonClick={(country: object) =>
            handleCountryClick(country as CountryFeature)
          }

          /* WAŻNE:
             Nie używamy pointsData, bo ono tworzy brzydkie słupki/cylindry.
             Zamiast tego używamy htmlElementsData. */
          pointsData={[]}
          ringsData={[]}
          arcsData={[]}
          labelsData={[]}
          htmlElementsData={cityPoints}
          htmlLat={(city: object) => (city as CityPoint).lat}
          htmlLng={(city: object) => (city as CityPoint).lng}
          htmlAltitude={0.018}
          htmlElement={(city: object) => createCityMarker(city as CityPoint)}
        />

        <header
          style={{
            position: "absolute",
            top: 32,
            left: 48,
            zIndex: 5,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(38px, 4.6vw, 72px)",
              lineHeight: 0.92,
              fontWeight: 950,
              letterSpacing: -2,
            }}
          >
            Hantavirus{" "}
            <span
              style={{
                color: "#ff263d",
              }}
            >
              Radar
            </span>
          </h1>

          <p
            style={{
              marginTop: 14,
              maxWidth: 620,
              color: "rgba(255,255,255,0.72)",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Click any country to check stored statistics. Highlighted countries
            have verified stored signals. City pins show verified city-level
            monitoring points.
          </p>
        </header>

        <div
          style={{
            position: "absolute",
            top: 22,
            right: 22,
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              height: 42,
              padding: "0 16px",
              borderRadius: 16,
              background: "rgba(0,0,0,0.58)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                background: "#ff263d",
                borderRadius: "50%",
                display: "inline-block",
              }}
            />

            LIVE

            <span
              style={{
                color: "rgba(255,255,255,0.55)",
                fontWeight: 600,
              }}
            >
              Supabase tracking
            </span>
          </div>

          <button
            style={{
              height: 42,
              width: 48,
              borderRadius: 15,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.58)",
              color: "white",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            🔔
          </button>

          <button
            style={{
              height: 46,
              padding: "0 24px",
              borderRadius: 16,
              border: "none",
              background: "#ff001e",
              color: "white",
              fontSize: 13,
              fontWeight: 950,
              cursor: "pointer",
              boxShadow: "0 18px 40px rgba(255,0,30,0.32)",
            }}
          >
            GET ALERTS
          </button>
        </div>

        <section
          style={{
            position: "absolute",
            right: 24,
            top: 110,
            zIndex: 5,
            width: 230,
            padding: 20,
            borderRadius: 20,
            background: "rgba(0,0,0,0.72)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
          }}
        >
          <h3
            style={{
              margin: "0 0 18px",
              fontSize: 17,
              fontWeight: 950,
            }}
          >
            RISK LEVELS
          </h3>

          {[
            ["#ff263d", "City monitoring pin"],
            ["#ff9fa8", "Country with stored signal"],
            ["rgba(255,255,255,0.36)", "No verified data"],
          ].map(([color, label]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 13,
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.84)",
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: color,
                  display: "inline-block",
                }}
              />

              {label}
            </div>
          ))}
        </section>

        <section
          style={{
            position: "absolute",
            right: 24,
            bottom: 176,
            zIndex: 7,
            width: 330,
            maxHeight: "45vh",
            overflowY: "auto",
            overflowX: "hidden",
            padding: 22,
            borderRadius: 22,
            background: "rgba(0,0,0,0.76)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.42)",
          }}
        >
          <div
            style={{
              color: "#ff6777",
              fontSize: 11,
              fontWeight: 950,
              letterSpacing: 3,
              marginBottom: 14,
            }}
          >
            {selectedPanel.type === "country"
              ? "COUNTRY DETAILS"
              : "CITY DETAILS"}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.15,
              fontWeight: 950,
              overflowWrap: "anywhere",
            }}
          >
            {selectedPanel.type === "country"
              ? selectedPanel.name
              : `${selectedPanel.name}, ${selectedPanel.country}`}
          </h2>

          {selectedPanel.type === "city" && (
            <div
              style={{
                marginTop: 8,
                color: "rgba(255,255,255,0.58)",
                fontSize: 13,
                overflowWrap: "anywhere",
              }}
            >
              {selectedPanel.region}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 18,
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  marginBottom: 6,
                }}
              >
                Cases
              </div>

              <div
                style={{
                  fontSize: 24,
                  fontWeight: 950,
                }}
              >
                {selectedPanel.cases}
              </div>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  marginBottom: 6,
                }}
              >
                Deaths
              </div>

              <div
                style={{
                  fontSize: 24,
                  fontWeight: 950,
                }}
              >
                {selectedPanel.deaths}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.78)",
              overflowWrap: "anywhere",
            }}
          >
            <strong>Status:</strong> {selectedPanel.status}
            <br />
            <strong>Source:</strong> {selectedPanel.source}
          </div>

          <p
            style={{
              margin: "16px 0 0",
              color: "rgba(255,255,255,0.74)",
              fontSize: 13,
              lineHeight: 1.55,
              overflowWrap: "anywhere",
            }}
          >
            {selectedPanel.note}
          </p>
        </section>

        <section
          style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 22,
            zIndex: 6,
            padding: 18,
            borderRadius: 22,
            background: "rgba(0,0,0,0.72)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(18px)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
            }}
          >
            <StatCard
              icon="☣"
              value={outbreakCities.length}
              label="ACTIVE SIGNALS"
              sublabel="verified only"
              color="#ff263d"
            />

            <StatCard
              icon="🌎"
              value={infectedCountryCount}
              label="COUNTRIES"
              sublabel="with verified signals"
              color="#ffd600"
            />

            <StatCard
              icon="🏙️"
              value={outbreakCities.length}
              label="CITY PINS"
              sublabel="clickable verified signals"
              color="#33d6ff"
            />

            <StatCard
              icon="🗓️"
              value="Live"
              label="LAST REFRESH"
              sublabel={new Date().toLocaleTimeString()}
              color="#00ff99"
            />
          </div>

          <div
            style={{
              marginTop: 14,
              borderRadius: 14,
              background: "rgba(0,0,0,0.48)",
              padding: "12px 14px",
              fontSize: 13,
              color: "rgba(255,255,255,0.74)",
            }}
          >
            <strong style={{ color: "#ff263d" }}>• LIVE FEED</strong>{" "}
            Verified source monitoring active. Click any country to view
            country statistics. Click city pins to view city-level details.
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  value,
  label,
  sublabel,
  color,
}: {
  icon: string;
  value: string | number;
  label: string;
  sublabel: string;
  color: string;
}) {
  return (
    <div
      style={{
        minHeight: 112,
        borderRadius: 18,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))",
        border: "1px solid rgba(255,255,255,0.13)",
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 22,
          marginBottom: 10,
        }}
      >
        {icon}
      </div>

      <div
        style={{
          fontSize: 42,
          fontWeight: 950,
          lineHeight: 0.9,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 950,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 2,
          fontSize: 12,
          fontWeight: 800,
          color,
        }}
      >
        {sublabel}
      </div>
    </div>
  );
}