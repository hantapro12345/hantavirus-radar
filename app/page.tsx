"use client";

import dynamic from "next/dynamic";

const OutbreakMap = dynamic(() => import("./components/OutbreakMap"), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <OutbreakMap />
    </main>
  );
}

