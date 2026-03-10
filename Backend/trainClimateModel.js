import * as tf from "@tensorflow/tfjs";
import fs from "fs";

/*
 Climate Model Training Script
 Predicts:
   1. Flood Risk
   2. Drought Risk

 Inputs:
 precipitation
 soilMoisture
 windSpeed
 temperature
 humidity

 Engineered Features:
 rainIndex
 drynessIndex
 stormIndex
*/

function createFeatures(data) {
  const rainIndex = data.precipitation * data.soilMoisture;
  const drynessIndex = data.temperature * (1 - data.humidity);
  const stormIndex = data.precipitation * data.windSpeed;

  return [
    data.precipitation,
    data.soilMoisture,
    data.windSpeed,
    data.temperature,
    data.humidity,
    rainIndex,
    drynessIndex,
    stormIndex
  ];
}

async function trainModel() {

  // Example training dataset
  const rawData = [
    { precipitation: 30, soilMoisture: 0.9, windSpeed: 12, temperature: 27, humidity: 0.85, flood: 0.9, drought: 0.1 },
    { precipitation: 2, soilMoisture: 0.1, windSpeed: 4, temperature: 40, humidity: 0.2, flood: 0.05, drought: 0.95 },
    { precipitation: 10, soilMoisture: 0.4, windSpeed: 6, temperature: 32, humidity: 0.5, flood: 0.3, drought: 0.5 },
    { precipitation: 35, soilMoisture: 0.95, windSpeed: 15, temperature: 26, humidity: 0.9, flood: 0.95, drought: 0.05 },
    { precipitation: 5, soilMoisture: 0.2, windSpeed: 5, temperature: 38, humidity: 0.3, flood: 0.1, drought: 0.85 },
    { precipitation: 18, soilMoisture: 0.6, windSpeed: 8, temperature: 30, humidity: 0.6, flood: 0.6, drought: 0.3 }
  ];

  const inputs = rawData.map(createFeatures);
  const outputs = rawData.map(d => [d.flood, d.drought]);

  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(outputs);

  const model = tf.sequential();

  model.add(tf.layers.dense({
    units: 16,
    activation: "relu",
    inputShape: [8]
  }));

  model.add(tf.layers.dense({
    units: 8,
    activation: "relu"
  }));

  model.add(tf.layers.dense({
    units: 2,
    activation: "sigmoid"
  }));

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "meanSquaredError"
  });

  console.log("Training model...");

  await model.fit(xs, ys, {
    epochs: 300,
    shuffle: true
  });

  // Save manually in pure JS TensorFlow
  const savePath = "./climate-model";
  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath);

  const modelJSON = await model.toJSON(null, false);
  fs.writeFileSync(`${savePath}/model.json`, JSON.stringify(modelJSON, null, 2)); // <-- FIXED

  console.log("Model trained and saved to ./climate-model/model.json");
}

trainModel();