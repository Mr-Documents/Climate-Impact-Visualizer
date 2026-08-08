/**
 * Tests for the shared feature encoding. Run: node --test features.test.js
 *
 * This module is the contract between training and inference, so its behaviour
 * is pinned here: if an edit breaks these, saved_model_forecast is invalidated
 * and trainForecastModel.js must be re-run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_NAMES, NUM_FEATURES, encodeFeatures, applyScaler,
  vapourPressureDeficit, composeSoilMoisture0to7
} from './features.js';

const sample = {
  temp: 25, humidity: 60, soil: 0.2, windSpeed: 10,
  windDir: 90, precip: 0, vpd: 1.2, hour: 12, month: 6
};

test('feature vector length matches the declared names', () => {
  assert.equal(NUM_FEATURES, FEATURE_NAMES.length);
  assert.equal(encodeFeatures(sample).length, NUM_FEATURES);
});

test('cyclic encodings make 23:00 and 00:00 adjacent', () => {
  const at23 = encodeFeatures({ ...sample, hour: 23 });
  const at00 = encodeFeatures({ ...sample, hour: 0 });
  const at12 = encodeFeatures({ ...sample, hour: 12 });
  const i = FEATURE_NAMES.indexOf('sinHour');
  const j = FEATURE_NAMES.indexOf('cosHour');
  const dist = (a, b) => Math.hypot(a[i] - b[i], a[j] - b[j]);
  assert.ok(dist(at23, at00) < dist(at00, at12),
    'hour 23 should sit closer to hour 0 than hour 0 does to hour 12');
});

test('December and January are adjacent in month encoding', () => {
  const dec = encodeFeatures({ ...sample, month: 12 });
  const jan = encodeFeatures({ ...sample, month: 1 });
  const jul = encodeFeatures({ ...sample, month: 7 });
  const i = FEATURE_NAMES.indexOf('sinMonth');
  const j = FEATURE_NAMES.indexOf('cosMonth');
  const dist = (a, b) => Math.hypot(a[i] - b[i], a[j] - b[j]);
  assert.ok(dist(dec, jan) < dist(jan, jul));
});

test('precipitation enters through log1p', () => {
  const idx = FEATURE_NAMES.indexOf('precipLog');
  assert.equal(encodeFeatures({ ...sample, precip: 0 })[idx], 0);
  assert.ok(Math.abs(encodeFeatures({ ...sample, precip: Math.E - 1 })[idx] - 1) < 1e-9);
  // Negative rainfall is not physical and must not produce NaN.
  assert.equal(encodeFeatures({ ...sample, precip: -5 })[idx], 0);
});

test('VPD matches the Magnus formula and rises as air dries', () => {
  // 25 C, 60% RH -> SVP 3.167 kPa, VPD 1.267 kPa
  assert.ok(Math.abs(vapourPressureDeficit(25, 60) - 1.267) < 0.01);
  assert.ok(Math.abs(vapourPressureDeficit(25, 100)) < 1e-9);
  assert.ok(vapourPressureDeficit(40, 20) > vapourPressureDeficit(20, 20));
});

test('applyScaler centres and scales per column', () => {
  const scaler = { mean: [10, 100], std: [2, 50] };
  assert.deepEqual(applyScaler([12, 150], scaler), [1, 1]);
  assert.deepEqual(applyScaler([10, 100], scaler), [0, 0]);
});

test('soil composition prefers the direct 0-7cm reading', () => {
  const v = composeSoilMoisture0to7({ direct: 0.31, band0to1: 0.1, band1to3: 0.1, band3to9: 0.1 });
  assert.equal(v, 0.31);
});

test('soil composition falls back to a depth-weighted average', () => {
  // Phoenix: 0-7cm is null but the bands are present.
  const v = composeSoilMoisture0to7({ direct: null, band0to1: 0.034, band1to3: 0.085, band3to9: 0.118 });
  assert.ok(Math.abs(v - (1 * 0.034 + 2 * 0.085 + 4 * 0.118) / 7) < 1e-9);
  assert.ok(v > 0.09 && v < 0.10);
});

test('soil composition returns null when nothing is usable', () => {
  assert.equal(composeSoilMoisture0to7({ direct: null, band0to1: null, band1to3: null, band3to9: null }), null);
  assert.equal(composeSoilMoisture0to7({}), null);
});
