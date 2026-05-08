"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const OutbreakMap = dynamic(() => import("./components/OutbreakMap"), {
  ssr: false,
});

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((previousKey) => previousKey + 1);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-black">
      <OutbreakMap key={refreshKey} />
    </main>
  );
}

