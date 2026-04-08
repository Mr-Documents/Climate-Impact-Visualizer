import express from 'express';
import rateLimit from 'express-rate-limit';
import { getAirQuality } from '../controllers/airqualitycontroller.js';
import { getWeatherData } from '../controllers/weathercontroller.js';
import { getPrecipitationSoil } from '../controllers/precipitationcontroller.js';
import { getCloudSolar } from '../controllers/cloudsolarcontroller.js';
import { getFloodRisk } from '../controllers/floodriskcontroller.js';
import { predictClimate, getHistoricalAnalysis, getSearchHistory, getGlobalAlerts } from '../controllers/climatepredictcontroller.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix Windows DLL loading for Native TensorFlow
if (process.platform === 'win32') {
  const tfDllPath = path.resolve(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
  process.env.PATH = `${process.env.PATH};${tfDllPath}`;
}

// Load TF dynamically
const tf = await import('@tensorflow/tfjs-node');

const router = express.Router();

let droughtModel = null;
let floodModel = null;

// Helper to format path for tfjs-node (avoiding %20 encoding issues)
const getModelUrl = (p) => {
  let resolved = path.resolve(p);
  if (process.platform === 'win32') resolved = resolved.replace(/\\/g, '/');
  return `file://${resolved}`;
};

// Load models once when server starts
(async () => {
  try {
    const droughtPath = path.join(__dirname, '..', 'saved_model_drought', 'model.json');
    if (fs.existsSync(droughtPath)) {
      droughtModel = await tf.loadLayersModel(getModelUrl(droughtPath));
    } else {
      console.warn(`[WARN] Drought model not found at ${droughtPath}. Run training script first.`);
    }

    const floodPath = path.join(__dirname, '..', 'saved_model_flood', 'model.json');
    if (fs.existsSync(floodPath)) {
      floodModel = await tf.loadLayersModel(getModelUrl(floodPath));
    } else {
      console.warn(`[WARN] Flood model not found at ${floodPath}. Run training script first.`);
    }

    if (droughtModel && floodModel) console.log('Models loaded successfully.');
  } catch (error) {
    console.error('Failed to load models:', error.message);
  }
})();

// Stricter rate limit for AI inference
// Prediction models are expensive to run; we limit this to 5 times per minute per user.
const predictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, 
  message: { 
    error: 'Too many analysis requests. Please wait a minute before analyzing a new location.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Predict drought
router.post('/predict-drought', predictLimiter, async (req, res) => {
  try {
    if (!droughtModel) return res.status(503).json({ error: 'Drought model not loaded. Please run the training script.' });

    const features = req.body.features; // Expect 2D array: [TIME_STEPS, numFeatures]
    if (!features) return res.status(400).json({ error: 'Features are required' });

    const risk = tf.tidy(() => {
      const inputTensor = tf.tensor3d([features]); // shape [1, TIME_STEPS, numFeatures]
      const prediction = droughtModel.predict(inputTensor);
      return prediction.argMax(-1).dataSync()[0]; // 0,1,2
    });
    res.json({ drought_risk: risk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Prediction failed' });
  }
});

// Predict flood
router.post('/predict-flood', predictLimiter, async (req, res) => {
  try {
    if (!floodModel) return res.status(503).json({ error: 'Flood model not loaded. Please run the training script.' });

    const features = req.body.features; // Expect 2D array: [TIME_STEPS, numFeatures]
    if (!features) return res.status(400).json({ error: 'Features are required' });

    const risk = tf.tidy(() => {
      const inputTensor = tf.tensor3d([features]);
      const prediction = floodModel.predict(inputTensor);
      return prediction.argMax(-1).dataSync()[0]; // 0,1,2
    });
    res.json({ flood_risk: risk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Prediction failed' });
  }
});













router.get('/airquality', getAirQuality);
router.get('/weather', getWeatherData);
router.get('/precipitation', getPrecipitationSoil);
router.get('/cloudsolar', getCloudSolar);
router.get('/floodrisk', getFloodRisk);    
router.post('/predict', predictLimiter, predictClimate);      
router.get('/historical-analysis', getHistoricalAnalysis);
router.get('/history', getSearchHistory);
router.get('/alerts', getGlobalAlerts);

export default router;
