import { predictClimateRisk } from "./prediction.js";

async function test() {
  // The LSTM model expects a sequence of 24 hours (TIME_STEPS)
  // Each hour needs 9 features: [temp, humidity, soil, windSpeed, vpd, sinWind, cosWind, hour, month]
  const mockSequence = Array.from({ length: 24 }, (_, i) => [
    25 + Math.random() * 5, // temp
    0.6 + Math.random() * 0.2, // humidity
    0.4, // soil moisture
    12, // wind speed
    1.2, // VPD
    0.5, 0.8, // sin/cos wind
    i, // hour
    10 // month
  ]);

  console.log("Starting test prediction with 24-hour sequence...");
  const result = await predictClimateRisk(mockSequence);

  console.log("Prediction Result:", result);
}

test();