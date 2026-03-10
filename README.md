# Climate Impact Visualizer

**Climate Impact Visualizer** is a full-stack web application designed to explore and predict climate-related risks across locations, with a focus on **drought predictions** using historical weather and environmental data.

This repo includes:

- **Frontend** (React): interactive maps, charts, and UI for risk insights.
- **Backend** (Node.js + Express): prediction APIs, weather data endpoints, and model hosting.
- **Drought prediction model**: trained model files stored under `Backend/climate-model/` used to infer drought risk.

---

## Ì∫Ä Features

- ‚úÖ **Drought risk prediction** (primary use case)
- Ìº¶Ô∏è Weather & precipitation visualizations
- Ì∑∫Ô∏è Location selection on an interactive map
- Ì≥à Charts and results display powered by predictions
- Ìºô Dark/light mode toggle

---

## Ìøó Architecture

### Frontend (React)
- Location: `frontend/` + top-level `src/` (mirrors Create React App layout)
- Key folders:
  - `src/pages/` ‚Äî app pages (dashboard, drought risk, precipitation, etc.)
  - `src/components/` ‚Äî reusable UI components (maps, charts, cards)
  - `src/services/api.js` ‚Äî API client used by the frontend to call the backend

### Backend (Node.js + Express)
- Location: `Backend/`
- Key files:
  - `server.js` ‚Äî Express server entry point
  - `routes/climateroutes.js` ‚Äî API routes
  - `controllers/` ‚Äî controller logic for predictions and climate endpoints
  - `prediction.js` ‚Äî model inference wrapper
  - `trainClimateModel.js` ‚Äî script used to train/update the drought model

### Drought Prediction Model
- Stored in: `Backend/climate-model/model.json`
- Used by: `Backend/prediction.js` and controllers

---

## Ìª† Setup & Run (Local)

### 1) Start the backend

```bash
cd Backend
npm install
npm run dev
```

This starts the backend API on `http://localhost:5000` (default).

### 2) Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm start
```

This starts the frontend on `http://localhost:3000`.

> ‚úÖ Ensure the backend is running so the frontend can fetch predictions.

---

## Ì¥ç How Drought Prediction Works

1. User selects coordinates via the map UI.
2. Frontend calls the backend prediction API (`/api/predict/drought`).
3. Backend loads the trained model and runs inference.
4. Results are returned and displayed as charts and risk indicators.

> Ì≤° To update the model, retrain using `Backend/trainClimateModel.js` and replace the output in `Backend/climate-model/`.

---

## Ì¥å API Endpoints (Reference)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/predict/drought` | POST | Get drought risk predictions for a location |
| `/api/weather` | GET | Fetch current weather (internal/third-party) |
| `/api/precipitation` | GET | Precipitation data support |

> See `Backend/routes/climateroutes.js` and `Backend/controllers/` for full details.

---

## Ì∑™ Testing

- Frontend: 
  ```bash
  cd frontend
  npm test
  ```

- Backend: Add tests under `Backend/` (not included by default).

---

## Ì≥¶ Build & Deploy

1. Build frontend: `cd frontend && npm run build`
2. Deploy static build (from `frontend/build`) to a hosting provider or serve via backend.
3. Ensure the backend is accessible and that API base URLs match deployed frontend configuration.

---

## ‚ú® Next Improvements

- Add user authentication + saved locations
- Add additional climate risk models (flood, air quality, solar/cloud)
- Improve model training pipeline and versioning
- Add end-to-end tests for API + UI

---

## Ì≥ù License

This project is provided for academic/demo use.

---

*Created as a final year project focusing on climate impact visualization and drought risk prediction.*
