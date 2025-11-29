// main.jsx or index.js — whichever exists

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// IMPORT BOOTSTRAP HERE
import 'bootstrap/dist/css/bootstrap.min.css';

import 'leaflet/dist/leaflet.css';



ReactDOM.createRoot(document.getElementById('root')).render(<App />);
