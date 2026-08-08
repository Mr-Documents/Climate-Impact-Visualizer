/**
 * Downloads the hourly training archive from Open-Meteo.
 *
 * LOCATION SELECTION
 * Cities are chosen to span the RANGE OF EACH CLIMATE VARIABLE the model will
 * meet in deployment, not to tick off climate-type labels. Measuring the
 * original five plus Basel showed full coverage of humidity (0-100%) and soil
 * moisture (0-0.52) but two gaps:
 *
 *   precipitation  reached only 13 mm/h, while flood-producing rain starts
 *                  around 30 mm/h - the flood model had never seen a flood
 *   temperature    bottomed out at -13 C, so frozen soil and snowmelt, where
 *                  soil moisture behaves entirely differently, were absent
 *
 * Each addition below names the gap it closes. Note that ERA5 reanalysis sits
 * on a ~31km grid and smooths convective peaks, so the wettest hours here will
 * still understate a real gauge reading; that is a property of the data source,
 * not of the selection.
 */
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const locations = [
  // --- Original set: temperate through tropical savanna ---
  { name: "Addis Ababa", lat: 8.98, lon: 38.79, fills: "subtropical highland" },
  { name: "Nairobi", lat: -1.29, lon: 36.82, fills: "subtropical highland" },
  { name: "Sao Paulo", lat: -23.55, lon: -46.63, fills: "humid subtropical" },
  { name: "Madrid", lat: 40.42, lon: -3.70, fills: "semi-arid Mediterranean" },
  { name: "Accra", lat: 5.60, lon: -0.20, fills: "coastal savanna" },

  // --- Precipitation gap: heavy convective and monsoon rainfall ---
  { name: "Mumbai", lat: 19.08, lon: 72.88, fills: "monsoon extremes" },
  { name: "Singapore", lat: 1.35, lon: 103.82, fills: "equatorial convective rain" },
  { name: "Manila", lat: 14.60, lon: 120.98, fills: "typhoon rainfall" },

  // --- Cold gap: sub-zero temperatures, frozen soil, snowmelt ---
  { name: "Winnipeg", lat: 49.90, lon: -97.14, fills: "continental, to -35 C" },
  { name: "Moscow", lat: 55.76, lon: 37.62, fills: "continental, to -25 C" },

  // --- Evaporative demand gap: inland desert, very high VPD ---
  { name: "Phoenix", lat: 33.45, lon: -112.07, fills: "inland desert, VPD > 6 kPa" }
];

const start = "2014-01-01";
const end = "2023-12-31";
const outputPath = path.join(__dirname, "training_dataset.csv");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Missing readings are written as an empty field, never as 0. The previous
 * version substituted 0, which fabricates bone-dry soil and zero rainfall -
 * values the label logic and the model both treat as real observations.
 */
const cell = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : v);

async function fetchData() {
  console.log(`Fetching ${locations.length} locations, ${start} to ${end}...`);
  const dataset = {};

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    process.stdout.write(`  ${(i + 1 + '/' + locations.length).padEnd(6)} ${loc.name.padEnd(13)} (${loc.fills}) ... `);

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&start_date=${start}&end_date=${end}` +
      `&hourly=temperature_2m,precipitation,relative_humidity_2m,wind_speed_10m,wind_direction_10m,` +
      `soil_moisture_0_to_7cm,vapour_pressure_deficit&timezone=auto`;

    try {
      const res = await axios.get(url, { timeout: 180000 });
      dataset[loc.name] = res.data.hourly;
      console.log(`${res.data.hourly.time.length} hours`);
    } catch (error) {
      const reason = error.response?.data?.reason || error.message;
      console.log(`FAILED (${reason})`);
      throw new Error(`Aborting: ${loc.name} failed. Partial data would silently skew training.`);
    }

    if (i < locations.length - 1) await sleep(10000); // respect API rate limits
  }

  // Every location is queried over the same date range, so the time axes align.
  const timestamps = dataset[locations[0].name].time;

  let csv = "timestamp";
  locations.forEach(loc => {
    const n = loc.name.replace(/\s+/g, '_');
    csv += `,${n}_Temp,${n}_Precip,${n}_Humidity,${n}_WindSpeed,${n}_WindDir,${n}_VPD,${n}_SoilMoisture`;
  });
  csv += "\n";

  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Match the YYYYMMDDTHHMM layout the training loader parses positionally.
    let row = timestamps[i].replace(/[-:]/g, "");
    if (row.length === 13) row += "0";

    locations.forEach(loc => {
      const d = dataset[loc.name];
      row += `,${cell(d.temperature_2m[i])},${cell(d.precipitation[i])},${cell(d.relative_humidity_2m[i])}` +
             `,${cell(d.wind_speed_10m[i])},${cell(d.wind_direction_10m[i])}` +
             `,${cell(d.vapour_pressure_deficit[i])},${cell(d.soil_moisture_0_to_7cm[i])}`;
    });
    rows.push(row);
  }

  fs.writeFileSync(outputPath, csv + rows.join("\n") + "\n");
  console.log(`\nSaved ${rows.length.toLocaleString()} rows x ${locations.length} locations to ${outputPath}`);
}

fetchData().catch(err => { console.error(err.message); process.exit(1); });
