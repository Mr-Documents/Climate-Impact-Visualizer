import express from 'express';
import { getAirQuality } from '../controllers/airqualitycontroller.js';
import { getWeatherData } from '../controllers/weathercontroller.js';
import { getPrecipitationSoil } from '../controllers/precipitationcontroller.js';
import { getCloudSolar } from '../controllers/cloudsolarcontroller.js';
import { getFloodRisk } from '../controllers/floodriskcontroller.js';
import { predictClimate } from '../controllers/climatepredictcontroller.js';
const router = express.Router();

router.get('/airquality', getAirQuality);
router.get('/weather', getWeatherData);
router.get('/precipitation', getPrecipitationSoil);
router.get('/cloudsolar', getCloudSolar);
router.get('/floodrisk', getFloodRisk);    
router.post('/predict', predictClimate);      

export default router;
