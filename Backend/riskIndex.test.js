/**
 * Tests for the risk index. Run: node --test riskIndex.test.js
 *
 * These assert the properties the index must hold to be defensible: correct
 * ordering across real climates, monotonicity in each driver, and sane bounds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDroughtRisk, computeFloodRisk, classify,
  antecedentPrecipitationIndex, drySpellDays,
  MEDIUM_THRESHOLD, HIGH_THRESHOLD
} from './riskIndex.js';

// Representative conditions, taken from live Open-Meteo values for each city.
const DUBAI = { soil: 0.055, vpd: 7.0, dryDays: 30, forecastPrecip24h: 0 };
const ACCRA_WET = { soil: 0.22, vpd: 0.7, dryDays: 0.5, forecastPrecip24h: 8 };
const UK_DRIZZLE = { soil: 0.40, vpd: 0.14, dryDays: 0, forecastPrecip24h: 5 };
const MONSOON = { soil: 0.44, vpd: 0.06, dryDays: 0, forecastPrecip24h: 90 };

test('classify respects the documented band edges', () => {
  assert.equal(classify(0), 'Low');
  assert.equal(classify(MEDIUM_THRESHOLD - 0.001), 'Low');
  assert.equal(classify(MEDIUM_THRESHOLD), 'Medium');
  assert.equal(classify(HIGH_THRESHOLD - 0.001), 'Medium');
  assert.equal(classify(HIGH_THRESHOLD), 'High');
  assert.equal(classify(1), 'High');
  assert.equal(classify(NaN), 'N/A');
});

test('drought: arid desert scores High, temperate scores Low', () => {
  assert.equal(computeDroughtRisk(DUBAI).label, 'High');
  assert.equal(computeDroughtRisk(UK_DRIZZLE).label, 'Low');
  assert.equal(computeDroughtRisk(MONSOON).label, 'Low');
});

test('drought: Dubai must outrank Accra, the original reported bug', () => {
  const dubai = computeDroughtRisk(DUBAI).score;
  const accra = computeDroughtRisk(ACCRA_WET).score;
  assert.ok(dubai > accra, `expected Dubai (${dubai}) > Accra (${accra})`);
});

test('flood: monsoon scores High, desert scores Low', () => {
  assert.equal(computeFloodRisk(MONSOON).label, 'High');
  assert.equal(computeFloodRisk(DUBAI).label, 'Low');
});

test('flood: saturated ground raises risk for identical rainfall', () => {
  const dry = computeFloodRisk({ soil: 0.10, forecastPrecip24h: 30, api7d: 0 }).score;
  const wet = computeFloodRisk({ soil: 0.44, forecastPrecip24h: 30, api7d: 80 }).score;
  assert.ok(wet > dry, `saturated (${wet}) should exceed dry (${dry})`);
});

test('drought score falls monotonically as soil moisture rises', () => {
  let previous = Infinity;
  for (const soil of [0.02, 0.08, 0.15, 0.22, 0.30, 0.40]) {
    const score = computeDroughtRisk({ soil, vpd: 2.0, dryDays: 5 }).score;
    assert.ok(score <= previous, `score rose at soil=${soil}`);
    previous = score;
  }
});

test('forecast rainfall relieves drought but never below zero', () => {
  const parched = { soil: 0.02, vpd: 6, dryDays: 30 };
  const withRain = computeDroughtRisk({ ...parched, forecastPrecip24h: 25 }).score;
  const without = computeDroughtRisk(parched).score;
  assert.ok(withRain < without);
  assert.ok(withRain >= 0);
});

test('scores always stay within [0,1]', () => {
  const extremes = [
    { soil: -5, vpd: 999, dryDays: 999, forecastPrecip24h: -5 },
    { soil: 99, vpd: -5, dryDays: -5, forecastPrecip24h: 9999 }
  ];
  for (const c of extremes) {
    for (const score of [computeDroughtRisk(c).score, computeFloodRisk(c).score]) {
      assert.ok(score >= 0 && score <= 1, `out of range: ${score}`);
    }
  }
});

test('antecedent index weights recent rain above older rain', () => {
  const recent = new Array(168).fill(0); recent[167] = 10;   // rain an hour ago
  const old = new Array(168).fill(0); old[0] = 10;           // rain seven days ago
  assert.ok(antecedentPrecipitationIndex(recent) > antecedentPrecipitationIndex(old));
  assert.equal(antecedentPrecipitationIndex([]), 0);
});

test('dry spell length grows with rainless hours', () => {
  const noRain = new Array(240).fill(0);
  const rainedRecently = new Array(240).fill(0); rainedRecently[239] = 5;
  assert.ok(drySpellDays(noRain) > drySpellDays(rainedRecently));
});

test('drivers are reported so the score can be explained', () => {
  const d = computeDroughtRisk(DUBAI);
  assert.deepEqual(
    Object.keys(d.drivers).sort(),
    ['drySpell', 'dryness', 'evaporativeDemand', 'rainfallRelief']
  );
});
