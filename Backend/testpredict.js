import { predictClimateRisk } from "./prediction.js";

async function test() {
  const result = await predictClimateRisk({
    precipitation: 25,
    soilMoisture: 0.7,
    windSpeed: 10,
    temperature: 28,
    humidity: 0.8
  });

  console.log("Prediction Result:", result);
}

test();