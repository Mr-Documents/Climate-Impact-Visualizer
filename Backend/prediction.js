import path from "path";
import fs from "fs";

// Fix Windows DLL loading
if (process.platform === 'win32') {
  const tfDllPath = path.join(process.cwd(), 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
  process.env.PATH = `${process.env.PATH};${tfDllPath}`;
  // Use delimiter to ensure compatibility across different shell environments
  process.env.PATH = `${process.env.PATH}${path.delimiter}${tfDllPath}`;
}

// Dynamic import to apply PATH change first
const tf = await import("@tensorflow/tfjs-node");

let loadedDroughtModel = null;
let loadedFloodModel = null;

/**
 * Predicts flood and drought risk using trained LSTM models
 * @param {number[][]} featuresSequence - array of [TIME_STEPS, numFeatures]
 */

export async function predictClimateRisk(featuresSequence) {
  if (!Array.isArray(featuresSequence) || featuresSequence.length === 0) {
    throw new Error("featuresSequence must be a non-empty 2D array");
  }

  // Load drought and flood models once
  if (!loadedDroughtModel || !loadedFloodModel) {
    const droughtModelPath = path.resolve("./saved_model_drought/model.json");
    const floodModelPath = path.resolve("./saved_model_flood/model.json");

    if (!fs.existsSync(droughtModelPath) || !fs.existsSync(floodModelPath)) {
      throw new Error("Model files not found. Please run 'node trainClimateModel.js' first.");
    }

    // Helper to format path for tfjs-node (avoiding %20 encoding issues)
    const getModelUrl = (p) => {
      let resolved = path.resolve(p);
      if (process.platform === 'win32') resolved = resolved.replace(/\\/g, '/');
      return `file://${resolved}`;
    };

    [loadedDroughtModel, loadedFloodModel] = await Promise.all([
      tf.loadLayersModel(getModelUrl(droughtModelPath)),
      tf.loadLayersModel(getModelUrl(floodModelPath))
    ]);
  }

  // Use tf.tidy to clean up all intermediate tensors (input, output, etc.) automatically
  const result = tf.tidy(() => {
    // Prepare input tensor (shape: [1, TIME_STEPS, numFeatures])
    const inputTensor = tf.tensor3d([featuresSequence]);

    // Predict drought
    const droughtOutput = loadedDroughtModel.predict(inputTensor);
    const droughtScores = droughtOutput.arraySync(); // Use synchronous arraySync inside tidy
    const droughtIndex = droughtScores[0].indexOf(Math.max(...droughtScores[0]));

    // Predict flood
    const floodOutput = loadedFloodModel.predict(inputTensor);
    const floodScores = floodOutput.arraySync();
    const floodIndex = floodScores[0].indexOf(Math.max(...floodScores[0]));

    // Convert numeric index to label
    const labels = ["Low", "Medium", "High"];

    return {
      drought: {
        score: Number(droughtScores[0][droughtIndex].toFixed(3)),
        label: labels[droughtIndex]
      },
      flood: {
        score: Number(floodScores[0][floodIndex].toFixed(3)),
        label: labels[floodIndex]
      }
    };
  });

  return result;
}