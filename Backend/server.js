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
// FRONTEND_URL may hold a comma-separated list, e.g. the Vercel production domain
// plus any preview domains. Trailing slashes are stripped so that a value like
// "https://example.vercel.app/" still matches the browser's Origin header.
const normalizeOrigin = (url) => url.trim().replace(/\/+$/, '');

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
}

if (allowedOrigins.length === 0) {
  console.warn('[CORS] FRONTEND_URL is not set — all browser requests will be blocked.');
}

const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header means a non-browser client (curl, health checks) — always allow.
    if (!origin) return callback(null, true);
    // Signal a disallowed origin by omitting the CORS headers rather than throwing,
    // which would surface as an opaque 500 instead of a clear CORS failure.
    callback(null, allowedOrigins.includes(normalizeOrigin(origin)));
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
app.listen(PORT, "0.0.0.0", () => 
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`)
);