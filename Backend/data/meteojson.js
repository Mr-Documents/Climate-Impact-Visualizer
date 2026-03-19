import * as tf from "@tensorflow/tfjs";
import fs from "fs";
import csvParse from "csv-parse/lib/sync"; // npm install csv-parse

const csvFile = fs.readFileSync("./data/historical_weather.csv");
const records = csvParse(csvFile, { columns: true, skip_empty_lines: true });

// Prepare inputs & outputs
const inputs = [];
const outputs = [];

records.forEach(r => {
  const rainIndex = r.precipitation * r.soilMoisture;
  const drynessIndex = r.temperature * (1 - r.humidity);
  const stormIndex = r.precipitation * r.windSpeed;

  inputs.push([
    +r.precipitation,
    +r.soilMoisture,
    +r.windSpeed,
    +r.temperature,
    +r.humidity,
    rainIndex,
    drynessIndex,
    stormIndex
  ]);

  outputs.push([+r.flood, +r.drought]);
});

const xs = tf.tensor2d(inputs);
const ys = tf.tensor2d(outputs);
