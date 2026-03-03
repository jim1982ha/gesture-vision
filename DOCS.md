# GestureVision Home Assistant Add-on

## Introduction
GestureVision is an AI-powered application that turns your webcam or RTSP camera into a gesture control device for Home Assistant.

## Configuration

### WebRTC / Video Streaming
To ensure the video feed works correctly, especially if accessing Home Assistant remotely:

1.  Go to the **Configuration** tab of this add-on.
2.  **`mtx_ice_host`**: Enter the **LAN IP address** of your Home Assistant server (e.g., `192.168.1.100`).
    *   *Why?* WebRTC requires this IP to establish the direct UDP video connection between your browser and the server.
    *   *External Access:* If you want to view the stream from outside your network, you may need to forward UDP port `8189` on your router to your Home Assistant IP and set this field to your WAN IP (or dynamic DNS hostname).

### Webcams
This add-on maps `/dev/video0`, `/dev/video1`, and `/dev/video2` by default. If your USB webcam is plugged in, it should appear in the "Camera Source" list within the GestureVision UI.

### Integration
The Home Assistant plugin is pre-installed and pre-configured to communicate securely with your Home Assistant instance. You do not need to configure URLs or Tokens manually.

Just select "Home Assistant" as the **Action Type** when configuring a gesture.