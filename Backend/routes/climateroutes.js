import express from 'express';
import rateLimit from 'express-rate-limit';
import { getAirQuality } from '../controllers/airqualitycontroller.js';
import { getWeatherData } from '../controllers/weathercontroller.js';
import { getPrecipitationSoil } from '../controllers/precipitationcontroller.js';
import { getCloudSolar } from '../controllers/cloudsolarcontroller.js';
import { getFloodRisk } from '../controllers/floodriskcontroller.js';
import { getUVDryness } from '../controllers/uvdrynesscontroller.js';
import { predictClimate, getHistoricalAnalysis, getSearchHistory, getGlobalAlerts } from '../controllers/climatepredictcontroller.js';

const router = express.Router();

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

router.get('/airquality', getAirQuality);
router.get('/weather', getWeatherData);
router.get('/precipitation', getPrecipitationSoil);
router.get('/cloudsolar', getCloudSolar);
router.get('/floodrisk', getFloodRisk);
router.get('/uv-dryness', getUVDryness);
router.post('/predict', predictLimiter, predictClimate);      
router.get('/historical-analysis', getHistoricalAnalysis);
router.get('/history', getSearchHistory);
router.get('/alerts', getGlobalAlerts);

export default router;
