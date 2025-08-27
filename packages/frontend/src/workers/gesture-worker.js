/* FILE: packages/frontend/src/workers/gesture-worker.js */
const baseOriginForWorker = self.location.origin;

// Path to the main MediaPipe Vision bundle
const UMD_BUNDLE_PATH = `${baseOriginForWorker}/local-bundles/mediapipe-tasks-vision-umd.js`;
const GESTURE_UTILS_PATH = `${baseOriginForWorker}/worker-lib/worker-gesture-utils.js`;

try {
  // Import all necessary scripts for the worker's global scope
  self.importScripts(UMD_BUNDLE_PATH, GESTURE_UTILS_PATH);
} catch (e) {
  self.postMessage({
    type: "error",
    error: {
      code: "WORKER_BUNDLE_LOAD_FAILED",
      message: `Bundle load failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    },
  });
  throw new Error(`Failed to load worker scripts.`);
}

const { GestureRecognizer, PoseLandmarker, FilesetResolver } =
  self.MediaPipeTasksVision || {};
if (!GestureRecognizer || !PoseLandmarker || !FilesetResolver) {
  self.postMessage({
    type: "error",
    error: {
      code: "WORKER_MEDIAPIPE_COMPONENTS_MISSING",
      message: "MediaPipeTasksVision components missing.",
    },
  });
}

let handRecognizer,
  poseLandmarker,
  vision;
let handModelLoaded = false,
  poseModelLoaded = false,
  isInitializing = false;
let enableHandProcessing = false,
  enablePoseProcessing = false;
let builtInHandGesturesExecutionEnabled = true,
  customHandGestureExecutionEnabled = false;
let lastProcessedTimestamp = -1;
let reinitDebounceTimer = null;
const customHandDefinitions = new Map(),
  customPoseDefinitions = new Map();
const HAND_MODEL_ASSET_PATH = `${baseOriginForWorker}/models/gesture_recognizer.task`;
const POSE_MODEL_ASSET_PATH = `${baseOriginForWorker}/models/pose_landmarker_lite.task`;
let handConfig = {},
  poseConfig = {};

const debouncedManageModels = (
  shouldHandBeActive,
  shouldPoseBeActive,
  handConfigChanged,
  poseConfigChanged
) => {
  if (reinitDebounceTimer) clearTimeout(reinitDebounceTimer);
  reinitDebounceTimer = setTimeout(
    () =>
      manageModels(
        shouldHandBeActive,
        shouldPoseBeActive,
        handConfigChanged,
        poseConfigChanged
      ).catch((e) => console.error("Debounced model management failed", e)),
    100
  );
};

async function getVisionResolver() {
  if (!vision)
    vision = await FilesetResolver.forVisionTasks(
      `${baseOriginForWorker}/wasm`
    );
  return vision;
}
async function createRecognizer(type, config) {
  const isHand = type === "hand";
  const ModelClass = isHand ? GestureRecognizer : PoseLandmarker;
  const modelPath = isHand ? HAND_MODEL_ASSET_PATH : POSE_MODEL_ASSET_PATH;
  const visionResolver = await getVisionResolver();
  const recognizerConfig = {
    baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
    ...config,
  };

  try {
    return await ModelClass.createFromOptions(visionResolver, recognizerConfig);
  } catch (gpuError) {
    console.warn(`[Worker] GPU ${type} model failed, trying CPU.`, gpuError);
    try {
      return await ModelClass.createFromOptions(visionResolver, {
        ...recognizerConfig,
        baseOptions: { ...recognizerConfig.baseOptions, delegate: "CPU" },
      });
    } catch (cpuError) {
      self.postMessage({
        type: "error",
        error: {
          code: "WORKER_MODEL_INIT_FAILED",
          message: `${type} model failed: ${
            cpuError instanceof Error ? cpuError.message : String(cpuError)
          }`,
        },
      });
      if (config.runningMode !== "IMAGE")
        isHand ? (handModelLoaded = false) : (poseModelLoaded = false);
      return null;
    }
  }
}

async function manageModels(
  shouldHand,
  shouldPose,
  handCfgChanged,
  poseCfgChanged
) {
  if (isInitializing) return;
  isInitializing = true;
  const actions = [];
  
  const actualShouldPose = shouldPose;

  if (shouldHand) {
    if (!handModelLoaded || handCfgChanged) {
      if (handRecognizer) { try { await handRecognizer.close(); } catch (_e) { /* no-op */ } }
      handRecognizer = null; handModelLoaded = false;
      actions.push(
        createRecognizer("hand", handConfig).then((r) => {
          if (r) { handRecognizer = r; handModelLoaded = true; self.postMessage({ type: "model_loaded", loaded: true, modelType: "hand" }); }
        })
      );
    }
  } else {
    if (handModelLoaded && handRecognizer) {
      try { await handRecognizer.close(); } catch (_e) { /* no-op */ }
      handRecognizer = null; handModelLoaded = false; self.postMessage({ type: "model_loaded", loaded: false, modelType: "hand" });
    }
  }

  if (actualShouldPose) {
    if (!poseModelLoaded || poseCfgChanged) {
      if (poseLandmarker) { try { await poseLandmarker.close(); } catch (_e) { /* no-op */ } }
      poseLandmarker = null; poseModelLoaded = false;
      actions.push(
        createRecognizer("pose", poseConfig).then((r) => {
          if (r) { poseLandmarker = r; poseModelLoaded = true; self.postMessage({ type: "model_loaded", loaded: true, modelType: "pose" }); }
        })
      );
    }
  } else {
    if (poseModelLoaded && poseLandmarker) {
      try { await poseLandmarker.close(); } catch (_e) { /* no-op */ }
      poseLandmarker = null; poseModelLoaded = false; self.postMessage({ type: "model_loaded", loaded: false, modelType: "pose" });
    }
  }

  if (actions.length > 0) await Promise.all(actions);
  isInitializing = false;
}

function runCustomGestureChecks(landmarks, definitions) {
  const detected = [];
  if (!landmarks?.length || !definitions?.size) return detected;

  definitions.forEach((def, name) => {
    try {
      const result = self.GestureUtils.checkGesture(landmarks, def.rules);
      if (result?.detected)
        detected.push({ categoryName: name, score: result.confidence || 1.0 });
    } catch (e) {
      self.postMessage({
        type: "error",
        error: {
          code: "WORKER_CUSTOM_EXEC_ERROR",
          message: `Error in gesture '${name}': ${ e instanceof Error ? e.message : String(e) }`,
        },
      });
      definitions.delete(name);
    }
  });
  return detected;
}

async function processImageSource(imageData, timestamp, staticRoiConfig, testRules, testTolerance, requestSnapshot) {
  if (isInitializing || timestamp <= lastProcessedTimestamp) {
    if (imageData instanceof ImageBitmap) imageData.close();
    return;
  }
  lastProcessedTimestamp = timestamp;

  let snapshotWasTaken = false;

  try {
    const startTime = performance.now();
    let handResults = null, poseResults = null, testResult = null, snapshotData = null;

    if (enablePoseProcessing && poseModelLoaded && poseLandmarker) {
      poseResults = poseLandmarker.detectForVideo(imageData, timestamp);
    }

    if (enableHandProcessing && handModelLoaded && handRecognizer) {
        handResults = handRecognizer.recognizeForVideo(imageData, timestamp);
    }

    if (testRules) {
        const landmarksForTest = testRules.type === 'hand' 
            ? (handResults?.landmarks?.[0] || null)
            : (poseResults?.landmarks?.[0] || null);
        
        if (landmarksForTest) {
            testResult = self.GestureUtils.checkGesture(landmarksForTest, { ...testRules, tolerance: testTolerance });
        }
    }
    
    if (requestSnapshot) {
      snapshotData = {
          landmarks: (handResults?.landmarks[0] || poseResults?.landmarks[0] || null),
          imageData: imageData, // Pass the ImageBitmap directly
      };
      snapshotWasTaken = true; // Mark it as taken so we don't close it in the finally block
    }

    const customActionable = [];
    if (enableHandProcessing && customHandGestureExecutionEnabled && handResults?.landmarks)
      handResults.landmarks.forEach((lms) => customActionable.push(...runCustomGestureChecks(lms, customHandDefinitions)));
    if (enablePoseProcessing && poseResults?.landmarks)
      poseResults.landmarks.forEach((lms) => customActionable.push(...runCustomGestureChecks(lms, customPoseDefinitions)));

    const finalHandGestures = enableHandProcessing && builtInHandGesturesExecutionEnabled && handResults ? handResults.gestures : [];
    
    const messagePayload = {
        type: "results",
        timestamp,
        results: {
            handGestureResults: { gestures: finalHandGestures || [], landmarks: handResults?.landmarks || [], worldLandmarks: handResults?.worldLandmarks || [] },
            customActionableGestures: customActionable,
            poseLandmarkerResults: { landmarks: poseResults?.landmarks || [], worldLandmarks: poseResults?.worldLandmarks || [] },
            roiConfig: staticRoiConfig, testResult, snapshot: snapshotData
        },
        processingTime: performance.now() - startTime,
    };
    
    const transferables = snapshotWasTaken ? [snapshotData.imageData] : [];
    self.postMessage(messagePayload, transferables);

  } catch (_e) {
    self.postMessage({
      type: "error",
      error: { code: "WORKER_RECOGNITION_ERROR", message: `Recognition failed: ${_e instanceof Error ? _e.message : String(_e)}` },
    });
  } finally {
    if (imageData instanceof ImageBitmap && !snapshotWasTaken) imageData.close();
  }
}

self.onmessage = async (event) => {
  const { type, payload, imageBitmap } = event.data;
  switch (type) {
    case "initialize": {
      const newHandConfig = {
        runningMode: "VIDEO",
        numHands: payload.numHands,
        minHandDetectionConfidence: payload.handDetectionConfidence,
        minHandPresenceConfidence: payload.handPresenceConfidence,
        minTrackingConfidence: payload.handTrackingConfidence,
      };
      const newPoseConfig = {
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: payload.poseDetectionConfidence,
        minPosePresenceConfidence: payload.posePresenceConfidence,
        minTrackingConfidence: payload.poseTrackingConfidence,
      };
      const handConfigChanged =
        JSON.stringify(handConfig) !== JSON.stringify(newHandConfig);
      const poseConfigChanged =
        JSON.stringify(poseConfig) !== JSON.stringify(newPoseConfig);
      handConfig = newHandConfig;
      poseConfig = newPoseConfig;
      enableHandProcessing = !!payload.enableHandProcessing;
      enablePoseProcessing = !!payload.enablePoseProcessing;
      builtInHandGesturesExecutionEnabled = !!payload.enableBuiltInHandGestures;
      customHandGestureExecutionEnabled = !!payload.enableCustomHandGestures;
      debouncedManageModels(
        enableHandProcessing,
        enablePoseProcessing,
        handConfigChanged,
        poseConfigChanged
      );
      if (customHandGestureExecutionEnabled || enablePoseProcessing)
        self.postMessage({ type: "WORKER_REQUESTS_CUSTOM_DEFINITIONS" });
      break;
    }
    case "LOAD_CUSTOM_GESTURES":
      customHandDefinitions.clear();
      customPoseDefinitions.clear();
      (payload?.gestures || []).forEach((def) => {
        try {
          const code = def.codeString.replace(
            /export\s+(const|function)\s+/g,
            "$1 "
          );
          const functionName =
            def.type === "pose" ? "checkPose" : "checkGesture";
          const mod = new Function(
            `${code}\nreturn { metadata, ${functionName} };`
          )();
          if (typeof mod[functionName] !== "function")
            throw new Error(`${functionName} is not a function`);

          const runtimeResult = mod[functionName]([], null);
          if (!runtimeResult || typeof runtimeResult.rules !== "object") {
            throw new Error(
              `Gesture function for '${mod.metadata.name}' did not return a valid rules object.`
            );
          }

          const definitionsMap =
            mod.metadata.type === "pose"
              ? customPoseDefinitions
              : customHandDefinitions;
          definitionsMap.set(mod.metadata.name, {
            ...mod.metadata,
            rules: runtimeResult.rules,
          });
        } catch (e) {
          self.postMessage({
            type: "error",
            error: {
              code: "WORKER_CUSTOM_IMPORT_FAILED",
              message: `Failed to import gesture '${def.name}': ${
                e instanceof Error ? e.message : String(e)
              }`,
            },
          });
        }
      });
      break;
    case "process_frame":
      await processImageSource(
        imageBitmap,
        event.data.timestamp,
        event.data.roiConfig,
        event.data.testRules,
        event.data.testTolerance,
        event.data.requestSnapshot
      );
      break;
  }
};