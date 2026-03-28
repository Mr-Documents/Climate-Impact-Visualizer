import axios from "axios";
import fs from "fs";
import path from "path";

const locations = [
  { name: "Addis Ababa", lat: 8.98, lon: 38.79 },
  { name: "Nairobi", lat: -1.29, lon: 36.82 },
  { name: "Sao Paulo", lat: -23.55, lon: -46.63 },
  { name: "Madrid", lat: 40.42, lon: -3.70 },
  { name: "Accra", lat: 5.60, lon: -0.20 }
];

// Expanded range to 10 years for better AI training variance
const start = "2014-01-01";
const end = "2023-12-31";
const outputPath = path.join("c:", "Users", "ramzy", "OneDrive", "Desktop", "Folders", "Final Year Project", "Climate impact visualizer", "Backend", "data", "training_dataset.csv");

// Helper to wait between API calls to avoid rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchData() {
  console.log(`Starting data fetch for ${locations.length} locations from ${start} to ${end}...`);
  let dataset = {};

  try {
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      console.log(`Fetching data for ${loc.name}...`);
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}&start_date=${start}&end_date=${end}&hourly=temperature_2m,precipitation,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_moisture_0_to_7cm,vapor_pressure_deficit&timezone=auto`;

      const res = await axios.get(url);
      dataset[loc.name] = res.data.hourly;

      if (i < locations.length - 1) {
        console.log("Waiting 15s to respect API rate limits...");
        await sleep(15000);
      }
    }

    const timestamps = dataset[locations[0].name].time;
    let csv = "timestamp";

    // Generate Headers
    locations.forEach(loc => {
      const n = loc.name.replace(/\s+/g, '_');
      csv += `,${n}_Temp,${n}_Precip,${n}_Humidity,${n}_WindSpeed,${n}_WindDir,${n}_VPD,${n}_SoilMoisture`;
    });
    csv += "\n";

    // Generate Rows
    for (let i = 0; i < timestamps.length; i++) {
      // Format timestamp to YYYYMMDDTHHMM to match your existing dataset style
      let row = timestamps[i].replace(/[-:]/g, ""); 
      if (row.length === 13) row += "0"; // Ensure minutes are represented if API omits them

      locations.forEach(loc => {
        const d = dataset[loc.name];
        row += `,${d.temperature_2m[i] ?? 0},${d.precipitation[i] ?? 0},${d.relative_humidity_2m[i] ?? 0},${d.wind_speed_10m[i] ?? 0},${d.wind_direction_10m[i] ?? 0},${d.vapor_pressure_deficit[i] ?? 0},${d.soil_moisture_0_to_7cm[i] ?? 0}`;
      });
      csv += row + "\n";

      if (i % 5000 === 0) console.log(`Processed ${i} of ${timestamps.length} timestamps...`);
    }

    fs.writeFileSync(outputPath, csv);
    console.log(`\nSuccess! Full training dataset saved to: ${outputPath}`);
    console.log(`Total records: ${timestamps.length}`);
  } catch (error) {
    if (error.response) {
      console.error("API Error Response:", error.response.data.reason || error.response.data);
    } else {
      console.error("Error fetching climate data:", error.message);
    }
  }
}

fetchData();