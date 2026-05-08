import fs from "fs";
import path from "path";

const inputPath = path.join(process.cwd(), "public", "data", "cities15000.txt");
const outputPath = path.join(process.cwd(), "public", "data", "world-cities.json");

if (!fs.existsSync(inputPath)) {
  console.error("❌ Nie znaleziono pliku:");
  console.error(inputPath);
  console.error("");
  console.error("Upewnij się, że plik cities15000.txt jest tutaj:");
  console.error("public/data/cities15000.txt");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");

const cities = raw
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const parts = line.split("\t");

    return {
      id: Number(parts[0]),
      name: parts[1],
      asciiName: parts[2],
      countryCode: parts[8],
      admin1: parts[10],
      lat: Number(parts[4]),
      lng: Number(parts[5]),
      population: Number(parts[14] || 0),
    };
  })
  .filter((city) => {
    return (
      city.name &&
      Number.isFinite(city.lat) &&
      Number.isFinite(city.lng) &&
      city.population >= 15000
    );
  })
  .sort((a, b) => b.population - a.population);

fs.writeFileSync(outputPath, JSON.stringify(cities, null, 2), "utf8");

console.log("✅ Gotowe!");
console.log(`Zapisano ${cities.length} miast do:`);
console.log(outputPath);