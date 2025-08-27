/* FILE: packages/frontend/public/worker-lib/worker-gesture-utils.js */
(function () {
  "use strict";

  // Prevent re-definition if script is loaded multiple times
  if (self.GestureUtils) return;

  // --- Landmark Constants ---
  const HandLandmarks = {
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_FINGER_MCP: 5,
    INDEX_FINGER_PIP: 6,
    INDEX_FINGER_DIP: 7,
    INDEX_FINGER_TIP: 8,
    MIDDLE_FINGER_MCP: 9,
    MIDDLE_FINGER_PIP: 10,
    MIDDLE_FINGER_DIP: 11,
    MIDDLE_FINGER_TIP: 12,
    RING_FINGER_MCP: 13,
    RING_FINGER_PIP: 14,
    RING_FINGER_DIP: 15,
    RING_FINGER_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20,
  };

  const PoseLandmarks = {
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_PINKY: 17,
    RIGHT_PINKY: 18,
    LEFT_INDEX: 19,
    RIGHT_INDEX: 20,
    LEFT_THUMB: 21,
    RIGHT_THUMB: 22,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31,
    RIGHT_FOOT_INDEX: 32,
  };

  // --- Core Calculation & Checking Logic ---
  const VISIBILITY_THRESHOLD = 0.65;
  const MIN_CONFIDENCE_FOR_DETECTION = 0.1;

  function areLandmarksVisible(points, type) {
    if (type === "hand") return points.length > 0;
    return points.every(
      (p) => p && p.visibility != null && p.visibility > VISIBILITY_THRESHOLD
    );
  }

  function calculateDistance(p1, p2) {
    const dx = p1.x - p2.x,
      dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function calculateAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y },
      v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 < 1e-6 || mag2 < 1e-6) return 180.0;
    return (
      Math.acos(Math.max(-1.0, Math.min(1.0, dot / (mag1 * mag2)))) *
      (180 / Math.PI)
    );
  }

  function calculateRuleScore(value, avg, minThresh, maxThresh) {
    if (value < minThresh || value > maxThresh) return 0.0;
    if (avg <= minThresh) return value >= minThresh ? 1.0 : 0.0;
    if (avg >= maxThresh) return value <= maxThresh ? 1.0 : 0.0;
    if (value <= avg)
      return avg - minThresh < 1e-6
        ? Math.abs(avg - value) < 1e-6
          ? 1.0
          : 0.0
        : (value - minThresh) / (avg - minThresh);
    return maxThresh - avg < 1e-6
      ? Math.abs(value - avg) < 1e-6
        ? 1.0
        : 0.0
      : (maxThresh - value) / (maxThresh - avg);
  }

  function checkGesture(landmarks, rules) {
    if (
      !landmarks ||
      !Array.isArray(landmarks) ||
      landmarks.length === 0 ||
      !rules
    )
      return { detected: false, confidence: 0 };
    const {
      type,
      relativeDistances = [],
      jointAngles = [],
      tolerance = 0.0,
    } = rules;

    if (type !== "hand" && type !== "pose")
      return { detected: false, confidence: 0 };

    const scores = [];
    const applyRule = (rule, calculateFn, points) => {
      let { min, max } = rule;
      if (tolerance > 0) {
        const originalRange = rule.max - rule.min;
        const toleranceAmount = (originalRange / 2) * tolerance;
        min = Math.max(0, rule.min - toleranceAmount);
        max = rule.max + toleranceAmount;
      }
      scores.push(
        calculateRuleScore(calculateFn(...points), rule.avg, min, max)
      );
    };

    relativeDistances.forEach((rule) => {
      const points = [landmarks[rule.p1], landmarks[rule.p2]].filter(Boolean);
      if (points.length === 2 && areLandmarksVisible(points, type))
        applyRule(rule, calculateDistance, points);
      else scores.push(0.0);
    });

    jointAngles.forEach((rule) => {
      const points = [
        landmarks[rule.p1],
        landmarks[rule.p2],
        landmarks[rule.p3],
      ].filter(Boolean);
      if (points.length === 3 && areLandmarksVisible(points, type))
        applyRule(rule, calculateAngle, points);
      else scores.push(0.0);
    });

    if (scores.length === 0) return { detected: false, confidence: 0.0 };
    const averageConfidence =
      scores.reduce((sum, score) => sum + score, 0.0) / scores.length;
    return {
      detected: averageConfidence >= MIN_CONFIDENCE_FOR_DETECTION,
      confidence: averageConfidence,
    };
  }

  // --- Misc Helpers ---
  function getLandmarkName(index, gestureType) {
    const source = gestureType === "hand" ? HandLandmarks : PoseLandmarks;
    for (const key in source) if (source[key] === index) return key;
    return `LANDMARK_${index}`;
  }

  function getLandmarkOverridePayloadForStudio(gestureType) {
    if (gestureType === "hand") return { hand: true, pose: false };
    if (gestureType === "pose") return { hand: false, pose: true };
    return null;
  }

  // --- Expose to worker's global scope ---
  const GestureUtils = {
    HandLandmarks,
    PoseLandmarks,
    checkGesture,
    getLandmarkName,
    getLandmarkOverridePayloadForStudio,
    calculateDistance,
    calculateAngle,
  };

  for (const key in GestureUtils) {
    self[key] = GestureUtils[key];
  }
  self.GestureUtils = GestureUtils;
})();
