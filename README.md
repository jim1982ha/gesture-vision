// --- README.md --- (complete version) ---
# GestureVision: AI-Powered Gesture Control for Your Digital World

<p align="center">
  <img src="./packages/frontend/public/icons/icon-128.webp" alt="GestureVision Logo" width="128">
</p>

<p align="center">
  <strong>Intuitive Gesture Control for a Smarter World.</strong>
</p>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture-overview">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

---

GestureVision is an innovative open-source web application that transforms how you interact with technology. By leveraging AI-powered computer vision on webcam or RTSP camera feeds, GestureVision translates natural human movements into configurable actions via a flexible plugin system, supporting integrations like Home Assistant, MQTT, webhooks, and OS commands.

It addresses the need for more natural, accessible, and efficient human-machine interfaces, reducing reliance on physical controls or voice commands. This is particularly valuable in smart environments, for enhancing accessibility, and for creating engaging interactive applications.

## ✨ Key Features

-   **Real-time Gesture & Pose Recognition:** Utilizes Google's MediaPipe for high-performance hand and pose detection that runs locally for full privacy.
-   **Versatile Video Sources:**
    -   **Webcam:** Processes your camera feed directly in the browser with no data sent to the cloud.
    -   **RTSP IP Cameras:** Connect to existing security or IP cameras for wider coverage and "always-on" monitoring.
-   **Powerful Plugin System:** The core of GestureVision's flexibility. Trigger actions in other systems:
    -   **Home Assistant:** Control lights, switches, scenes, and any entity in your smart home.
    -   **MQTT:** Publish custom messages to an MQTT broker for endless IoT integrations.
    -   **Webhooks:** Send HTTP requests to services like IFTTT, Zapier, or your own custom servers.
    -   **OS Commands:** Control your computer (e.g., media playback, presentations) via a lightweight companion app.
-   **Gesture Studio:** An integrated, user-friendly tool to visually record and create your own unique custom gestures without writing any code.
-   **Interactive Dashboard:** A hands-free UI overlay where you can "click" widgets using gestures to trigger actions, providing immediate visual control over connected systems.
-   **Performance Focused:** On-demand streaming and Region of Interest (ROI) processing focus CPU resources where they're needed, improving efficiency and accuracy.
-   **Modern & Responsive UI:** A clean, themable interface (with multiple themes and Light/Dark modes) that works beautifully on both desktop and mobile devices.

## 🏗️ Architecture Overview

GestureVision is a modern full-stack application built with a clear separation of concerns, designed for performance and extensibility.

-   **Frontend (`packages/frontend`):** A React application (built with Vite) that handles the UI. All AI processing for webcam streams occurs client-side in a Web Worker, ensuring privacy and a responsive interface.
-   **Backend (`packages/backend`):** A Node.js/Express server that serves application configuration, manages the plugin lifecycle, and facilitates real-time communication via WebSockets.
-   **Streaming Server (MediaMTX):** Integrates the powerful MediaMTX server to ingest standard RTSP streams and efficiently re-stream them to the browser using the low-latency WHEP protocol.
-   **Containerized Deployment:** The entire application stack is containerized with Docker and managed via Docker Compose (or HA Supervisor) for simple, reproducible deployments.

## 🚀 Getting Started

This project is managed as a monorepo. All commands should be run from the project root.

### 1. Home Assistant Add-on (Easiest)

If you are a Home Assistant user, this is the recommended installation method.

1.  **Add Repository:** Go to your Home Assistant Add-on Store -> Repositories and add:
    `https://github.com/jim1982ha/gesture-vision`
2.  **Install:** Find "GestureVision" in the list and click Install.
3.  **Configure:** In the Add-on Configuration tab, set your `mtx_ice_host` to your Home Assistant LAN IP address (required for video streaming).
4.  **Start:** Start the add-on and open the Web UI. The Home Assistant plugin will be auto-installed and configured for you.

### 2. Production Deployment (Standalone Docker)

This method is for running the application as a stable service on a generic Linux server. It uses Docker and assumes you have a reverse proxy like Nginx Proxy Manager.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    ```
2.  **Run the Interactive Setup Script:**
    This script will guide you through creating the necessary environment files and deploying the container.
    ```bash
    chmod +x ./tools/update_prod.sh
    ./tools/update_prod.sh
    ```
3.  **Configure Your Reverse Proxy:** For detailed steps, please see the complete [**Production Deployment Guide**](./packages/frontend/public/docs/PRODUCTION.md).

### 3. Local Development

For contributors or those who want to modify the code.

1.  **Clone and Install:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    npm install
    ```
2.  **Run the Development Setup Script:**
    This script handles all necessary setup, including Docker containers for the backend, MediaMTX, and the Vite development server with Hot Module Replacement.
    ```bash
    chmod +x ./tools/update_dev.sh
    ./tools/update_dev.sh
    ```
3.  **Access the Application:** Open your browser to the URL provided by the script (usually `https://localhost:8001`).

For more details, see the [**Local Development Guide**](./packages/frontend/public/docs/DEVELOPMENT.md).

## ❤️ Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request. For major changes, please open an issue first to discuss what you would like to change. You can also reach out at **contact@gesturevision.anonaddy.com**.

The [**Plugin Development Guide**](./packages/frontend/public/docs/PLUGIN_DEV.md) is available to help you get started with creating your own extensions.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file, for details.
