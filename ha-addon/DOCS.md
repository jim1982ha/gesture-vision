# GestureVision Home Assistant Add-on

## Introduction
GestureVision is an AI-powered application that turns your webcam or RTSP camera into a gesture control device for Home Assistant.

## Configuration

### WebRTC / Video Streaming
To ensure the video feed works correctly, especially if accessing Home Assistant remotely:

1.  Go to the **Configuration** tab of this add-on.
2.  **`mtx_ice_host`**: Enter the **LAN IP address** of your Home Assistant server (e.g., `192.168.1.100`).
    *   *Why?* WebRTC requires this IP to establish the direct UDP video connection between your browser and the server.

### Webcams
This add-on maps `/dev/video0`, `/dev/video1`, and `/dev/video2` by default.

### Integration
The Home Assistant plugin is pre-installed and pre-configured. Select "Home Assistant" as the **Action Type** when configuring a gesture.