import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 0. FIX TENSORFLOW NATIVE LOADING ON WINDOWS ---
// This fixes ERR_DLOPEN_FAILED by adding the DLL path to the system PATH before loading
if (process.platform === 'win32') {
  const tfDllPath = path.join(process.cwd(), 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
  process.env.PATH = `${process.env.PATH};${tfDllPath}`;
}

let tf;
try {
  // Load dynamically to ensure PATH is updated first
  tf = await import('@tensorflow/tfjs-node');
} catch (err) {
  console.error("\n[CRITICAL ERROR] Could not load Native TensorFlow.");
  console.error("Try moving your project folder to a shorter path (e.g. C:\\ClimateViz) to avoid OneDrive/Windows path limits.");
  throw err;
}

// --- 1. DATASET CONFIGURATION ---
const DATASETS = [
  { path: path.join(__dirname, 'data', 'dataset-10yrs.csv'), isBasel: true },
  { path: path.join(__dirname, 'data', 'training_dataset.csv'), isBasel: false }
];

// Label columns
const DROUGHT_LABEL = 'drought_risk';
const FLOOD_LABEL = 'flood_risk'; // will be generated automatically

// --- 2. MODEL HYPERPARAMETERS ---
const LEARNING_RATE = 0.001;
const EPOCHS = 25;
const BATCH_SIZE = 32;
const TIME_STEPS = 24; // look-back 24 hours
const TRAIN_SPLIT = 0.8;

// --- 3. HELPER FUNCTIONS ---
function processRow(row, prefix, isBasel = false) {
  let temp, humidity, soil, windSpeed, windDir, vpd, precip;

  if (isBasel) {
    // Map Basel-specific long column names
    temp = parseFloat(row['Basel Temperature [2 m elevation corrected]']);
    humidity = parseFloat(row['Basel Relative Humidity [2 m]']);
    soil = parseFloat(row['Basel Soil Moisture [0-7 cm down]']);
    windSpeed = parseFloat(row['Basel Wind Speed [10 m]']);
    windDir = parseFloat(row['Basel Wind Direction [10 m]']);
    vpd = parseFloat(row['Basel Vapor Pressure Deficit [2 m]']);
    precip = parseFloat(row['Basel Precipitation Total']);
  } else {
    // Map Global dataset short column names
    temp = parseFloat(row[`${prefix}_Temp`]);
    humidity = parseFloat(row[`${prefix}_Humidity`]);
    soil = parseFloat(row[`${prefix}_SoilMoisture`]);
    windSpeed = parseFloat(row[`${prefix}_WindSpeed`]);
    windDir = parseFloat(row[`${prefix}_WindDir`]);
    vpd = parseFloat(row[`${prefix}_VPD`]);
    precip = parseFloat(row[`${prefix}_Precip`]);
  }

  // Timestamp features
  const ts = row.timestamp || row['\ufefftimestamp']; // Handle potential BOM
  if (!ts) return null;
  const date = new Date(ts.slice(0,4)+'-'+ts.slice(4,6)+'-'+ts.slice(6,8)+'T'+ts.slice(9,11)+':00:00Z');
  const hour = date.getUTCHours();
  const month = date.getUTCMonth() + 1;

  // Check for parsing errors
  const parsedFeatures = [temp, humidity, soil, windSpeed, windDir, vpd, precip, hour, month];
  if (parsedFeatures.some(isNaN)) {
    // console.warn('Skipping row with invalid data:', row);
    return null;
  }

  // Encode wind direction
  const sinWind = Math.sin(windDir * Math.PI / 180);
  const cosWind = Math.cos(windDir * Math.PI / 180);

  const features = [
    temp, humidity, soil, windSpeed, vpd, sinWind, cosWind, hour, month
  ];

  // Drought label generation (0: low, 1: medium, 2: high)
  let droughtLabel = 0;
  if (soil < 0.15 && vpd > 2.0) droughtLabel = 2; // High risk
  else if (soil < 0.25 && vpd > 1.0) droughtLabel = 1; // Medium risk


  // Flood label generation
  let floodLabel = 0; // low
  if (precip >= 50 || soil >= 0.5) floodLabel = 2; // high
  else if (precip >= 20 || soil >= 0.35) floodLabel = 1; // medium

  return { features, droughtLabel, floodLabel };
}

// Normalize data
function normalizeTensor(tensor) {
  const mean = tensor.mean(0);
  const std = tensor.sub(mean).square().mean(0).sqrt();
  const normalized = tensor.sub(mean).div(std.add(1e-6));
  return { normalized, mean, std };
}

// Create sequences for LSTM
function createSequences(featuresTensor, labelsTensor, timeSteps) {
  return tf.tidy(() => {
    const xs = [];
    const ys = [];
    for (let i = 0; i < featuresTensor.shape[0] - timeSteps; i++) {
      xs.push(featuresTensor.slice([i, 0], [timeSteps, featuresTensor.shape[1]]));
      ys.push(labelsTensor.slice([i + timeSteps], [1]));
    }
    return {
      xs: tf.stack(xs), // [samples, timeSteps, numFeatures]
      ys: tf.oneHot(tf.concat(ys).cast('int32'), 3) // 3 classes
    };
  });
}

// --- 4. LOAD DATA ---
async function loadDataset() {
  const rawData = [];
  const locationPrefixes = ['Addis_Ababa', 'Nairobi', 'Sao_Paulo', 'Madrid', 'Accra'];

  const readCsvFile = (config) => {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(config.path)) {
        console.warn(`[WARN] Skipping missing file: ${config.path}`);
        return resolve();
      }
      
      fs.createReadStream(config.path)
        .pipe(csv())
        .on('data', row => {
          const prefixes = config.isBasel ? ['Basel'] : locationPrefixes;
          prefixes.forEach(prefix => {
            const processed = processRow(row, prefix, config.isBasel);
            if (processed) rawData.push(processed);
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });
  };

  return new Promise(async (resolve, reject) => {
    try {
      for (const ds of DATASETS) {
        console.log(`Ingesting: ${path.basename(ds.path)}...`);
        await readCsvFile(ds);
      }

        if (rawData.length === 0) {
          return reject(new Error("Combined dataset is empty. Ensure data files are in the /data folder."));
        }
        
        console.log(`Merged Pool Size: ${rawData.length} total sequences.`);

        const featuresTensor = tf.tensor2d(rawData.map(r => r.features));
        const droughtLabelsTensor = tf.tensor1d(rawData.map(r => r.droughtLabel), 'int32');
        const floodLabelsTensor = tf.tensor1d(rawData.map(r => r.floodLabel), 'int32');

        // CRITICAL: Clear the JavaScript array immediately to free up V8 heap memory
        rawData.length = 0; 

        resolve({ featuresTensor, droughtLabelsTensor, floodLabelsTensor });
    } catch (err) {
      reject(err);
    }
  });
}

// --- 5. CREATE LSTM MODEL ---
function createLSTMModel(numFeatures) {
  const model = tf.sequential();
  model.add(tf.layers.lstm({
    units: 32,
    inputShape: [TIME_STEPS, numFeatures],
    returnSequences: false
  }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' })); // 3 classes
  model.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  return model;
}

// Custom save handler for pure tfjs in Node
async function saveModelToDisk(model, dirPath) {
  // tfjs-node expects a 'file://' prefix.
  // We manually construct this to avoid pathToFileURL encoding spaces as %20,
  // which causes "EINVAL: invalid argument, mkdir" errors in tfjs-node on Windows.
  let absolutePath = path.resolve(dirPath);
  if (process.platform === 'win32') {
    absolutePath = absolutePath.replace(/\\/g, '/');
  }
  const saveUrl = `file://${absolutePath}`;
  await model.save(saveUrl);
}

// --- 6. TRAIN FUNCTION ---
async function trainModel(featuresTensor, labelsTensor, modelName) {
  const { normalized: featuresNorm, mean, std } = normalizeTensor(featuresTensor);

  // Split the base tensors BEFORE creating sequences to save massive amounts of RAM
  const totalSamples = featuresNorm.shape[0];
  const splitIndex = Math.floor(totalSamples * TRAIN_SPLIT);

  const featuresTrain = featuresNorm.slice([0, 0], [splitIndex, -1]);
  const labelsTrain = labelsTensor.slice([0], [splitIndex]);
  const featuresVal = featuresNorm.slice([splitIndex, 0], [-1, -1]);
  const labelsVal = labelsTensor.slice([splitIndex], [-1]);

  // Create sequences only for the specific sets
  const { xs: xTrain, ys: yTrain } = createSequences(featuresTrain, labelsTrain, TIME_STEPS);
  const { xs: xVal, ys: yVal } = createSequences(featuresVal, labelsVal, TIME_STEPS);

  const model = createLSTMModel(featuresNorm.shape[1]);

  console.log(`\n[RE-TRAINING] Starting fresh training for ${modelName} using the combined dataset...`);
  const savePath = path.join(__dirname, `saved_model_${modelName}`);

  await model.fit(xTrain, yTrain, {
    epochs: EPOCHS,
    batchSize: BATCH_SIZE,
    validationData: [xVal, yVal],
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        console.log(`[${modelName}] Epoch ${epoch+1}/${EPOCHS} - loss: ${logs.loss.toFixed(4)} - acc: ${logs.acc.toFixed(4)} - val_loss: ${logs.val_loss.toFixed(4)} - val_acc: ${logs.val_acc.toFixed(4)}`);
        
        // Save a checkpoint every 5 epochs so progress isn't lost if the script crashes
        if ((epoch + 1) % 5 === 0) {
          await saveModelToDisk(model, savePath);
          console.log(` -> Checkpoint: ${modelName} model updated on disk at epoch ${epoch + 1}`);
        }
      }
    }
  });
  await saveModelToDisk(model, savePath);
  console.log(`${modelName} model saved at: ${savePath}`);

  // Clean up all training-specific tensors to free memory for the next model
  tf.dispose([featuresNorm, mean, std, featuresTrain, labelsTrain, featuresVal, labelsVal, xTrain, yTrain, xVal, yVal]);
  model.dispose();
}

// --- 7. RUN ---
async function main() {
  try {
    console.log('Loading dataset...');
    const { featuresTensor, droughtLabelsTensor, floodLabelsTensor } = await loadDataset();

    // Skipping drought model as it is already trained and saved.
    // await trainModel(featuresTensor, droughtLabelsTensor, 'drought');
    await trainModel(featuresTensor, floodLabelsTensor, 'flood');

    tf.dispose([featuresTensor, droughtLabelsTensor, floodLabelsTensor]);
  } catch (err) {
    console.error(err);
  }
}

main();