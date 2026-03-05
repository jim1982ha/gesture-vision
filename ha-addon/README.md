# GestureVision

![Supports aarch64 Architecture](https://img.shields.io/badge/aarch64-yes-green.svg)
![Supports amd64 Architecture](https://img.shields.io/badge/amd64-yes-green.svg)
![Security Rating](https://img.shields.io/badge/Security-7-blue)

**Intuitive Gesture Control for a Smarter World.**

GestureVision is an AI-powered computer vision application that transforms your webcam or RTSP camera into a powerful gesture controller for Home Assistant.

## ✨ Key Features

*   **✋ Hand Gesture Recognition:** Triggers actions using simple gestures like "Thumbs Up", "Victory", "Open Palm", and more.
*   **🧍 Pose Detection:** Recognize body poses to trigger automation.
*   **🏠 Native Home Assistant Integration:** Control lights, scripts, and scenes directly. No complex configuration required.
*   **🖱️ Interactive Dashboard:** "Click" virtual buttons floating on your video feed using just your finger.
*   **📷 Versatile Input:** Supports USB Webcams and RTSP IP Cameras.
*   **🔒 Local Processing:** All AI processing runs locally on your device. No cloud dependencies.

## 🚀 Getting Started

1.  **Installation:** You have already installed the add-on!
2.  **Configuration:**
    *   Go to the **Configuration** tab.
    *   **Crucial:** Set `mtx_ice_host` to the **Local LAN IP** of your Home Assistant server (e.g., `192.168.1.50`). This is required for the video stream to work.
    *   Select your webcam device or configure RTSP in the Web UI later.
3.  **Start:** Start the add-on and click **Open Web UI**.

## 🛠️ Usage

1.  Open the Web UI.
2.  Go to **Settings** > **Gestures**.
3.  Add a new action:
    *   Select a Gesture (e.g., "Thumb Up").
    *   Select "Home Assistant" as the Action Type.
    *   Choose your Domain, Entity, and Service (e.g., `light.turn_on`).
4.  Perform the gesture in front of the camera!

## 📚 Documentation

For full documentation, guides, and advanced configuration (MQTT, Webhooks), please visit the [Official Repository](https://github.com/jim1982ha/gesture-vision).