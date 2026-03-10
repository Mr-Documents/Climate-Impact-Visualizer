import * as tf from "@tensorflow/tfjs";
import fs from "fs";
import path from "path";

/**
 * Predicts flood and drought risk using trained climate AI model
 * @param {Object} data
 * @param {number} data.precipitation - mm
 * @param {number} data.soilMoisture - 0-1
 * @param {number} data.windSpeed - km/h
 * @param {number} data.temperature - °C
 * @param {number} data.humidity - 0-1
 */
export async function predictClimateRisk({
  precipitation = 0,
  soilMoisture = 0,
  windSpeed = 0,
  temperature = 25,
  humidity = 0.5
} = {}) {
  
  // Normalize inputs and ensure valid numbers
  const p = Math.max(0, Number(precipitation) || 0);
  const s = Math.min(1, Math.max(0, Number(soilMoisture) || 0));
  const w = Math.max(0, Number(windSpeed) || 0);
  const t = Number(temperature) || 25;
  const h = Math.min(1, Math.max(0, Number(humidity) || 0));

  // Compute engineered features
  const rainIndex = p * s;
  const drynessIndex = t * (1 - h);
  const stormIndex = p * w;

  // Load model from manually saved JSON
  const modelPath = path.resolve("./climate-model/model.json");
  const modelJSON = fs.readFileSync(modelPath, "utf-8");
  const model = await tf.models.modelFromJSON(JSON.parse(modelJSON));

  // Prepare input tensor (1 sample, 8 features)
  const inputTensor = tf.tensor2d([[p, s, w, t, h, rainIndex, drynessIndex, stormIndex]]);

  // Predict
  const output = model.predict(inputTensor);
  const scores = await output.array(); // [[floodScore, droughtScore]]
  const [floodScore, droughtScore] = scores[0];

  // Convert numeric scores to labels
  const getLabel = (score) => {
    if (score > 0.65) return "High";
    else if (score > 0.35) return "Medium";
    return "Low";
  };

  return {
    flood: {
      score: Number(floodScore.toFixed(3)),
      label: getLabel(floodScore)
    },
    drought: {
      score: Number(droughtScore.toFixed(3)),
      label: getLabel(droughtScore)
    }
  };
}
