import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import climateRoutes from './routes/climateroutes.js';

const app = express();

app.use(cors());

// General rate limiter to protect the API from basic spam/DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: "Too many requests, please try again after 15 minutes." }
});

// **This is required to parse JSON bodies**
app.use(express.json());
app.use('/api', apiLimiter);

app.use('/api', climateRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
