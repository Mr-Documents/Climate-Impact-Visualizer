/**
 * End-to-end check of the forecast + risk pipeline against live Open-Meteo data.
 *
 * Fetches real conditions for a spread of climate zones and prints the resulting
 * risk bands. A working model must separate these: an arid desert should not
 * score the same as a monsoon city. The previous classifier returned
 * "drought Low / flood Medium" for every location on Earth, which is what this
 * script exists to catch.
 *
 * Run: node testpredict.js
 */
import { predictClimateRisk } from "./prediction.js";
import { vapourPressureDeficit, composeSoilMoisture0to7 } from "./features.js";
import { drySpellDaysFromDaily } from "./riskIndex.js";

const LOCATIONS = [
  { name: "Dubai, UAE", lat: 25.20, lon: 55.27, expect: "arid" },
  { name: "Phoenix, USA", lat: 33.45, lon: -112.07, expect: "arid" },
  { name: "Accra, Ghana", lat: 5.56, lon: -0.20, expect: "tropical" },
  { name: "Mumbai, India", lat: 19.08, lon: 72.88, expect: "monsoon" },
  { name: "London, UK", lat: 51.51, lon: -0.13, expect: "temperate" },
  { name: "Reykjavik, Iceland", lat: 64.15, lon: -21.94, expect: "subpolar" }
];

const TIME_STEPS = 24;

/** Mirrors the request the controller makes, so this exercises the real path. */
async function fetchConditions(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,soil_moisture_0_to_7cm` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,` +
    `soil_moisture_0_to_7cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm` +
    `&past_days=7&forecast_days=1&timezone=auto`;
  const data = await (await fetch(url)).json();

  const lastMonth = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${lastMonth}&end_date=${new Date().toISOString().split('T')[0]}` +
    `&daily=precipitation_sum&timezone=auto`;
  const archive = await (await fetch(archiveUrl)).json();

  return { data, daily: archive?.daily?.precipitation_sum || [] };
}

function buildHistory(data) {
  const hourly = data.hourly;
  const utcOffsetMs = (data.utc_offset_seconds ?? 0) * 1000;
  const nowISO = new Date(Date.now() + utcOffsetMs).toISOString().slice(0, 13);

  let currentIndex = hourly.time.findIndex(t => t.startsWith(nowISO));
  if (currentIndex === -1 || currentIndex < TIME_STEPS - 1) {
    currentIndex = Math.min(hourly.time.length - 1, TIME_STEPS - 1);
  }

  const soilSeries = hourly.time.map((_, i) => composeSoilMoisture0to7({
    direct: hourly.soil_moisture_0_to_7cm?.[i],
    band0to1: hourly.soil_moisture_0_to_1cm?.[i],
    band1to3: hourly.soil_moisture_1_to_3cm?.[i],
    band3to9: hourly.soil_moisture_3_to_9cm?.[i]
  }));

  const history = [];
  for (let i = TIME_STEPS - 1; i >= 0; i--) {
    const idx = currentIndex - i;
    const temp = hourly.temperature_2m[idx];
    const humidity = hourly.relative_humidity_2m[idx];
    const timeStr = hourly.time[idx];
    history.push({
      temp,
      humidity,
      soil: soilSeries[idx],
      windSpeed: hourly.wind_speed_10m[idx],
      windDir: hourly.wind_direction_10m[idx],
      precip: hourly.precipitation[idx] ?? 0,
      vpd: vapourPressureDeficit(temp, humidity),
      hour: Number(timeStr.slice(11, 13)),
      month: Number(timeStr.slice(5, 7))
    });
  }
  const recentPrecipHourly = hourly.precipitation.slice(0, currentIndex + 1).map(v => v ?? 0);
  return { history, recentPrecipHourly };
}

async function main() {
  console.log('Fetching live conditions and running the forecast pipeline...\n');
  const header = 'LOCATION'.padEnd(20) + 'CLIMATE'.padEnd(11) + 'SOIL'.padEnd(7) + 'VPD'.padEnd(7) +
    'RAIN24h'.padEnd(9) + 'DROUGHT'.padEnd(16) + 'FLOOD';
  console.log(header);
  console.log('-'.repeat(header.length + 8));

  for (const loc of LOCATIONS) {
    try {
      const { data, daily } = await fetchConditions(loc.lat, loc.lon);
      const { history, recentPrecipHourly } = buildHistory(data);
      const dryDays = drySpellDaysFromDaily(daily);

      const result = await predictClimateRisk({ history, recentPrecipHourly, dryDays });
      const latest = history[history.length - 1];

      console.log(
        loc.name.padEnd(20) +
        loc.expect.padEnd(11) +
        latest.soil.toFixed(3).padEnd(7) +
        latest.vpd.toFixed(2).padEnd(7) +
        `${result.forecast.precip24hMm}mm`.padEnd(9) +
        `${result.drought.label} (${result.drought.score})`.padEnd(16) +
        `${result.flood.label} (${result.flood.score})`
      );
    } catch (err) {
      console.log(loc.name.padEnd(20) + `ERROR: ${err.message}`);
    }
  }
  console.log('\nA healthy model separates these rows. Identical output everywhere means');
  console.log('the scaler or feature encoding has drifted - see features.js.');
}

main().catch(err => { console.error(err); process.exit(1); });
