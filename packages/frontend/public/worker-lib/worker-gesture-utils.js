/* FILE: packages/frontend/public/worker-lib/worker-gesture-utils.js */
(function () {
  "use strict";

  if (self.GestureUtils) return;

  // --- Landmark Constants ---
  const HandLandmarks = { WRIST: 0, THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4, INDEX_FINGER_MCP: 5, INDEX_FINGER_PIP: 6, INDEX_FINGER_DIP: 7, INDEX_FINGER_TIP: 8, MIDDLE_FINGER_MCP: 9, MIDDLE_FINGER_PIP: 10, MIDDLE_FINGER_DIP: 11, MIDDLE_FINGER_TIP: 12, RING_FINGER_MCP: 13, RING_FINGER_PIP: 14, RING_FINGER_DIP: 15, RING_FINGER_TIP: 16, PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20 };
  const PoseLandmarks = { NOSE: 0, LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3, RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6, LEFT_EAR: 7, RIGHT_EAR: 8, MOUTH_LEFT: 9, MOUTH_RIGHT: 10, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16, LEFT_PINKY: 17, RIGHT_PINKY: 18, LEFT_INDEX: 19, RIGHT_INDEX: 20, LEFT_THUMB: 21, RIGHT_THUMB: 22, LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26, LEFT_ANKLE: 27, RIGHT_ANKLE: 28, LEFT_HEEL: 29, RIGHT_HEEL: 30, LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32 };

  // --- Core Calculation & Checking Logic ---
  const STD_DEV_MULTIPLIER = 3.5;
  const VectorUtils = {
    subtract: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z }),
    normalize: (v) => {
      const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      return mag > 1e-6 ? { x: v.x / mag, y: v.y / mag, z: v.z / mag } : { x: 0, y: 0, z: 0 };
    }
  };

  function getVectorConfidence(liveVec, rule) {
    const meanVec = { x: rule.meanX, y: rule.meanY, z: rule.meanZ };
    const stdDevVec = { x: rule.stdDevX, y: rule.stdDevY, z: rule.stdDevZ };
    const zScoreX = stdDevVec.x > 1e-6 ? Math.abs(liveVec.x - meanVec.x) / stdDevVec.x : 0;
    const zScoreY = stdDevVec.y > 1e-6 ? Math.abs(liveVec.y - meanVec.y) / stdDevVec.y : 0;
    const zScoreZ = stdDevVec.z > 1e-6 ? Math.abs(liveVec.z - meanVec.z) / stdDevVec.z : 0;
    const maxZScore = Math.max(zScoreX, zScoreY, zScoreZ);
    if (maxZScore > STD_DEV_MULTIPLIER) return 0.0;
    return Math.exp(-0.5 * Math.pow(maxZScore, 2));
  }

  function getPositionConfidence(liveDelta, rule) {
      if (rule.stdDev < 1e-6) return Math.abs(liveDelta - rule.mean) < 1e-6 ? 1.0 : 0.0;
      const zScore = Math.abs(liveDelta - rule.mean) / rule.stdDev;
      if (zScore > STD_DEV_MULTIPLIER) return 0.0;
      return Math.exp(-0.5 * Math.pow(zScore, 2));
  }

  function getLiveChirality(landmarks) {
      if (!landmarks || landmarks.length < 21) return 'unknown';
      return landmarks[17].x < landmarks[5].x ? 'right' : 'left';
  }

  function checkStaticGesture(landmarks, worldLandmarks, rules, tolerance = 0.0) {
    if (!worldLandmarks || worldLandmarks.length === 0 || !rules) {
      return { detected: false, confidence: 0 };
    }
    const { vectors = [], relativePositions = [], focusPoints = [], chirality: recordedChirality } = rules;
    const ruleScores = [];
    const liveChirality = getLiveChirality(landmarks);
    const needsFlip = recordedChirality !== 'none' && liveChirality !== 'unknown' && recordedChirality !== liveChirality;

    const getFlippedVec = (vec) => ({ x: -vec.x, y: vec.y, z: -vec.z });
    const getFlippedDelta = (delta, axis) => (axis === 'x' ? -delta : delta);

    for (const rule of vectors) {
      const p1 = worldLandmarks[rule.p1], p2 = worldLandmarks[rule.p2];
      if (p1 && p2) {
        let liveVecNormalized = VectorUtils.normalize(VectorUtils.subtract(p1, p2));
        if (needsFlip) liveVecNormalized = getFlippedVec(liveVecNormalized);
        ruleScores.push(getVectorConfidence(liveVecNormalized, rule));
      } else { ruleScores.push(0.0); }
    }

    if (landmarks && landmarks.length > 0) {
      for (const rule of relativePositions) {
        const p1 = landmarks[rule.p1], p2 = landmarks[rule.p2];
        if (p1 && p2) {
          let liveDelta = p1[rule.axis] - p2[rule.axis];
          if (needsFlip) liveDelta = getFlippedDelta(liveDelta, rule.axis);
          ruleScores.push(getPositionConfidence(liveDelta, rule));
        } else { ruleScores.push(0.0); }
      }
    }

    if (ruleScores.length === 0) return { detected: false, confidence: 0 };
    const shapeConfidence = ruleScores.reduce((s, c) => s + c, 0) / ruleScores.length;
    let visibilityScore = 1.0;
    if (landmarks && landmarks.length > 0 && focusPoints.length > 0) {
        let totalVisibility = 0, visibleCount = 0;
        for (const index of focusPoints) {
            if (landmarks[index]) {
                totalVisibility += landmarks[index].presence ?? landmarks[index].visibility ?? 1.0;
                visibleCount++;
            }
        }
        visibilityScore = visibleCount > 0 ? totalVisibility / visibleCount : 0.0;
    }
    const finalConfidence = shapeConfidence * visibilityScore;
    return { detected: finalConfidence >= tolerance, confidence: finalConfidence, requiredConfidence: tolerance };
  }
  
  /**
   * Centralized utility to compile a gesture's code string into an executable module.
   * @param {string} codeString - The raw JS code of the gesture.
   * @param {'hand' | 'pose'} type - The type of gesture, to determine the function name.
   * @returns {object|null} The compiled module with metadata and check function, or null on error.
   */
  function compileGestureCode(codeString, type) {
    if (!codeString || !type) return null;
    try {
      const code = codeString.replace(/export\s+(const|function)\s+/g, "$1 ");
      const functionName = type === "pose" ? "checkPose" : "checkGesture";
      const mod = new Function(`${code}\nreturn { metadata, ${functionName} };`)();
      if (typeof mod[functionName] !== "function") {
        throw new Error(`${functionName} is not a function`);
      }
      return {
        ...mod.metadata,
        checkGesture: mod.checkGesture,
        checkPose: mod.checkPose,
      };
    } catch (e) {
      console.error(`[GestureUtils] Failed to compile gesture code:`, e);
      return null;
    }
  }

  // --- Expose to worker's global scope ---
  const GestureUtils = {
    HandLandmarks, PoseLandmarks, checkStaticGesture, compileGestureCode
  };

  for (const key in GestureUtils) {
    self[key] = GestureUtils[key];
  }
  self.GestureUtils = GestureUtils;
})();