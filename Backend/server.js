import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import climateRoutes from './routes/climateroutes.js';

dotenv.config();

const app = express();

// Trust proxy is essential for rate-limiting to work correctly on hosting platforms like Render or AWS
app.set('trust proxy', 1);

// Professional CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = [process.env.FRONTEND_URL];
    if (process.env.NODE_ENV !== 'production') {
      allowed.push('http://localhost:3000', 'http://localhost:5173');
    }
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));

// General rate limiter to protect the API from basic spam/DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: "Too many requests, please try again after 15 minutes." }
});

// Health check endpoint for Render/Monitoring services
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// **This is required to parse JSON bodies**
app.use(express.json());

// Mount routes with the limiter applied
app.use('/api', apiLimiter, climateRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));
