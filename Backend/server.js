import express from 'express';
import cors from 'cors';
import climateRoutes from './routes/climateroutes.js';

const app = express();

app.use(cors());

// **This is required to parse JSON bodies**
app.use(express.json());

app.use('/api', climateRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));











