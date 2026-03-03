/* FILE: packages/frontend/src/workers/gesture-worker.ts */
/// <reference lib="webworker" />
import type { GestureRecognizer, HandLandmarkerResult, PoseLandmarker, PoseLandmarkerResult, Landmark } from '@mediapipe/tasks-vision';
import type { CustomGestureMetadata, RoiConfig } from '#shared/index.js';

// --- Type Definitions ---
type VisionFilesetResolver = object;

interface MediaPipeTasksVisionModule {
    FilesetResolver: {
        forVisionTasks: (path: string) => Promise<VisionFilesetResolver>;
    };
    GestureRecognizer: {
        createFromOptions: (vision: VisionFilesetResolver, options: object) => Promise<GestureRecognizer>;
    };
    PoseLandmarker: {
        createFromOptions: (vision: VisionFilesetResolver, options: object) => Promise<PoseLandmarker>;
    };
}
declare const MediaPipeTasksVision: MediaPipeTasksVisionModule;

type CheckGestureFunction = (landmarks: Landmark[], worldLandmarks: Landmark[], tolerance: number) => { detected: boolean; confidence: number };

interface CustomGestureModule {
  checkGesture?: CheckGestureFunction;
  checkPose?: CheckGestureFunction;
  type: 'hand' | 'pose';
}

type MediaPipeModel = GestureRecognizer | PoseLandmarker;

interface WorkerReconfigurePayload {
  basePath?: string; // Added field
  numHands: number;
  enableHandProcessing: boolean;
  enablePoseProcessing: boolean;
  enableBuiltInHandGestures: boolean;
  enableCustomHandGestures: boolean;
  handDetectionConfidence: number;
  handPresenceConfidence: number;
  handTrackingConfidence: number;
  poseDetectionConfidence: number;
  posePresenceConfidence: number;
  poseTrackingConfidence: number;
}

interface ProcessFramePayload {
  imageBitmap: ImageBitmap;
  timestamp: number;
  roiConfig: RoiConfig | null;
  requestSnapshot: boolean;
}

// --- Worker State ---
let handLandmarker: GestureRecognizer | null = null;
let poseLandmarker: PoseLandmarker | null = null;
const customGestureModules: Map<string, CustomGestureModule> = new Map();
let mediaPipeLoadPromise: Promise<void> | null = null;
let workerReady = false;
let config: WorkerReconfigurePayload | null = null;

// --- MediaPipe and Model Management ---
function ensureMediaPipeIsLoaded(basePath: string): Promise<void> {
  if (!mediaPipeLoadPromise) {
    mediaPipeLoadPromise = new Promise((resolve, reject) => {
      if (typeof MediaPipeTasksVision !== 'undefined') return resolve();
      try {
        const scriptUrl = `${basePath}local-bundles/mediapipe-tasks-vision-umd.js`;
        importScripts(scriptUrl);
        resolve();
      } catch (e) {
        self.postMessage({ type: 'error', error: { code: 'MEDIAPIPE_LOAD_FAILED', message: (e as Error).message } });
        reject(e);
      }
    });
  }
  return mediaPipeLoadPromise;
}

async function initializeHandLandmarker(): Promise<GestureRecognizer> {
  const basePath = config?.basePath || '/';
  const vision = await MediaPipeTasksVision.FilesetResolver.forVisionTasks(`${basePath}wasm`);
  return MediaPipeTasksVision.GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${basePath}models/gesture_recognizer.task`, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: config!.numHands,
    minHandDetectionConfidence: config!.handDetectionConfidence,
    minHandPresenceConfidence: config!.handPresenceConfidence,
    minTrackingConfidence: config!.handTrackingConfidence,
  });
}

async function initializePoseLandmarker(): Promise<PoseLandmarker> {
  const basePath = config?.basePath || '/';
  const vision = await MediaPipeTasksVision.FilesetResolver.forVisionTasks(`${basePath}wasm`);
  return MediaPipeTasksVision.PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${basePath}models/pose_landmarker_lite.task`, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: config!.poseDetectionConfidence,
    minPosePresenceConfidence: config!.posePresenceConfidence,
    minTrackingConfidence: config!.poseTrackingConfidence,
  });
}

async function manageModelLifecycle<T extends MediaPipeModel>(modelType: 'hand' | 'pose', currentInstance: T | null, isEnabled: boolean, createFn: () => Promise<T>, forceRecreate: boolean): Promise<T | null> {
  if (isEnabled) {
    if (currentInstance && forceRecreate) {
      currentInstance.close();
      currentInstance = null;
    }
    if (!currentInstance) {
      try {
        currentInstance = await createFn();
        self.postMessage({ type: 'model_loaded', modelType, status: true });
      } catch (e) {
        self.postMessage({ type: 'model_loaded', modelType, status: false });
        self.postMessage({ type: 'error', error: { code: `${modelType.toUpperCase()}_MODEL_INIT_FAILED`, message: (e as Error).message } });
        return null;
      }
    }
  } else if (currentInstance) {
    currentInstance.close();
    currentInstance = null;
    self.postMessage({ type: 'model_loaded', modelType, status: false });
  }
  return currentInstance;
}

// --- Custom Gesture Execution ---
function executeCustomHandGestures(handResults: HandLandmarkerResult): { categoryName: string; score: number }[] {
    const detections: { categoryName: string; score: number }[] = [];
    if (!config?.enableCustomHandGestures || !handResults?.landmarks || handResults.landmarks.length === 0) return detections;
    for (const [name, module] of customGestureModules.entries()) {
      if (module.type === 'hand' && module.checkGesture && handResults.landmarks[0] && handResults.worldLandmarks[0]) {
        const result = module.checkGesture(handResults.landmarks[0], handResults.worldLandmarks[0], 0.5);
        if (result.detected) {
          detections.push({ categoryName: name, score: result.confidence });
        }
      }
    }
    return detections;
}

// --- Frame Processing ---
function detect(payload: ProcessFramePayload) {
  const { imageBitmap, timestamp, requestSnapshot } = payload;
  if (!imageBitmap || !config || !workerReady) {
    imageBitmap.close();
    return;
  }
  const startTime = performance.now();
  let handGestureResults: HandLandmarkerResult | undefined;
  let poseLandmarkerResults: PoseLandmarkerResult | undefined;
  let customActionableGestures: { categoryName: string; score: number }[] = [];

  try {
    if (handLandmarker && config.enableHandProcessing) {
      handGestureResults = handLandmarker.recognizeForVideo(imageBitmap, timestamp);
      customActionableGestures = executeCustomHandGestures(handGestureResults);
    }
    if (poseLandmarker && config.enablePoseProcessing) {
      poseLandmarkerResults = poseLandmarker.detectForVideo(imageBitmap, timestamp);
    }

    const processingTime = performance.now() - startTime;
    
    let snapshot: { imageData: ImageData | null; landmarks2d: Landmark[] | null; landmarks3d: Landmark[] | null; } | null = null;
    if (requestSnapshot) {
      const offscreen = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = offscreen.getContext('2d');
      ctx?.drawImage(imageBitmap, 0, 0);
      snapshot = {
        imageData: ctx?.getImageData(0, 0, offscreen.width, offscreen.height) ?? null,
        landmarks2d: handGestureResults?.landmarks?.[0] || poseLandmarkerResults?.landmarks?.[0] || null,
        landmarks3d: handGestureResults?.worldLandmarks?.[0] || poseLandmarkerResults?.worldLandmarks?.[0] || null,
      };
    }

    self.postMessage({
      type: 'results',
      results: { handGestureResults, poseLandmarkerResults, customActionableGestures, snapshot },
      processingTime,
    });

  } finally {
    imageBitmap.close();
  }
}

// --- Message Handling ---
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'initialize': {
      workerReady = false; 
      const newConfig = payload as WorkerReconfigurePayload;
      const handModelNeedsRecreation = !config || newConfig.numHands !== config.numHands || newConfig.handDetectionConfidence !== config.handDetectionConfidence || newConfig.handPresenceConfidence !== config.handPresenceConfidence || newConfig.handTrackingConfidence !== config.handTrackingConfidence;
      const poseModelNeedsRecreation = !config || newConfig.poseDetectionConfidence !== config.poseDetectionConfidence || newConfig.posePresenceConfidence !== config.posePresenceConfidence || newConfig.poseTrackingConfidence !== config.poseTrackingConfidence;
      config = newConfig;

      try {
        await ensureMediaPipeIsLoaded(config.basePath || '/');
      } catch (_e) {
        console.error("[Worker] Aborting initialization due to MediaPipe load failure.");
        return;
      }

      await Promise.all([
        manageModelLifecycle('hand', handLandmarker, config.enableHandProcessing, initializeHandLandmarker, handModelNeedsRecreation).then(res => { handLandmarker = res; }),
        manageModelLifecycle('pose', poseLandmarker, config.enablePoseProcessing, initializePoseLandmarker, poseModelNeedsRecreation).then(res => { poseLandmarker = res; })
      ]);
      workerReady = true;
      self.postMessage({ type: 'worker_ready' });
      break;
    }
    case 'LOAD_CUSTOM_GESTURES': {
      customGestureModules.clear();
      const gesturesToLoad: CustomGestureMetadata[] = payload.gestures;
      for (const gestureMeta of gesturesToLoad) {
        try {
          if (gestureMeta.codeString.includes('export const baseRules')) continue;
          const checkFnName = gestureMeta.type === 'pose' ? 'checkPose' : 'checkGesture';
          const functionBodyMatch = gestureMeta.codeString.match(new RegExp(`export function ${checkFnName}\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*)\\}`, 'm'));
          if (functionBodyMatch) {
            const [_, args, body] = functionBodyMatch;
            const argNames = args.split(',').map(arg => arg.split('=')[0].trim()).filter(Boolean);
            const createdFn = new Function(...argNames, body);
            customGestureModules.set(gestureMeta.name, { [checkFnName]: createdFn as CheckGestureFunction, type: gestureMeta.type || 'hand' });
          } else {
            console.warn(`[Worker] Could not extract '${checkFnName}' function from custom gesture '${gestureMeta.name}'.`);
          }
        } catch (e) {
          console.error(`[Worker] Failed to parse custom gesture '${gestureMeta.name}':`, e);
        }
      }
      break;
    }
    case 'process_frame':
      detect(payload as ProcessFramePayload);
      break;
  }
};