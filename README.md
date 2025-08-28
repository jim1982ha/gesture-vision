# GestureVision: AI-Powered Gesture Control for Your Digital World

<p align="center">
  <img src="./packages/frontend/public/icons/icon-72.webp" alt="GestureVision Logo" width="150">
</p>

<p align="center">
  <strong>Transform how you interact with your smart home, desktop applications, and digital services using the power of gesture recognition.</strong>
</p>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture-overview">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

---

GestureVision is an open-source web application that uses your webcam or IP cameras to recognize hand gestures and body poses. It translates these movements into configurable actions, creating a powerful, touchless interface for your entire digital ecosystem.

## ✨ Key Features

- **Real-time Gesture & Pose Recognition:** Utilizes Google's MediaPipe for high-performance hand and pose detection directly in the browser or on your local server.
- **Versatile Video Sources:**
  - **Webcam:** Processes video with full privacy, as all AI processing happens on your local device.
  - **RTSP IP Cameras:** Connect to existing security or IP cameras for wider coverage and "always-on" monitoring.
- **Powerful Plugin System:** The core of GestureVision's flexibility. Trigger actions in other systems:
  - **Home Assistant:** Control lights, switches, scenes, and any entity in your smart home.
  - **MQTT:** Publish custom messages to an MQTT broker for endless IoT integrations.
  - **Webhooks:** Send HTTP requests to services like IFTTT, Zapier, or your own custom servers.
  - **OS Commands & Presenter:** Control your computer directly (e.g., media playback, slide navigation) via a lightweight companion app.
- **Gesture Studio:** An integrated, user-friendly tool to record and create your own unique custom gestures without writing a single line of code.
- **Performance Focused:**
  - **On-Demand Streaming:** Conserves network and CPU resources by only connecting to RTSP streams when they are actively being viewed.
  - **Region of Interest (ROI):** Focus processing on a specific area of the video feed to improve performance and reduce false positives.
- **Modern & Responsive UI:** A clean, themable interface (Light/Dark modes) that works beautifully on both desktop and mobile devices.

## 🏗️ Architecture Overview

GestureVision is a modern full-stack application built with a clear separation of concerns, designed for performance and extensibility.

- **Frontend (`packages/frontend`):** A vanilla TypeScript application built with Vite. It handles the UI and, critically, performs all AI processing for webcam streams inside a Web Worker.
- **Backend (`packages/backend`):** A Node.js/Express application written in TypeScript. It serves the application configuration, manages the plugin lifecycle, and facilitates real-time communication via WebSockets.
- **Streaming Server (MediaMTX):** Integrates the powerful MediaMTX server to ingest standard RTSP streams and efficiently re-stream them to the browser using the low-latency WHEP protocol.
- **Plugin System (`extensions/plugins`):** All actions are handled by self-contained plugins, making the system easy to extend.
- **Containerized Deployment:** The entire application stack is containerized with Docker and managed via Docker Compose for simple, reproducible deployments.

## 🚀 Getting Started

This project is managed as a monorepo. All commands should be run from the project root.

### 1. Prerequisites

- Docker & Docker Compose V2
- Node.js & npm (v18+ recommended)
- Git

### 2. Production Deployment (Recommended)

This method is for running the application as a stable service. It uses Docker and assumes you have a reverse proxy like Nginx Proxy Manager for HTTPS.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    ```
2.  **Run the Interactive Setup Script:**
    This script will guide you through creating the necessary environment files (`.env.prod`) and building/running the Docker container.
    ```bash
    chmod +x ./tools/update_prod.sh
    ./tools/update_prod.sh
    ```
3.  **Configure Your Reverse Proxy:** For detailed steps on setting up your reverse proxy and firewall, please see the complete [**Production Deployment Guide**](./packages/frontend/public/docs/PRODUCTION.md).

### 3. Local Development

For contributors or those who want to modify the code.

1.  **Clone and Install:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    npm install
    ```
2.  **Run the Development Setup Script:**
    This script handles all the necessary setup, including Docker containers for the backend, MediaMTX, and the Vite development server with Hot Module Replacement.
    ```bash
    chmod +x ../tools/update_dev.sh
    ./tools/update_dev.sh
    ```
3.  **Access the Application:** Open your browser to the URL provided by the script (usually `https://localhost:8001`).

For more detailed instructions, see the [**Local Development Guide**](./packages/frontend/public/docs/DEVELOPMENT.md).

### 4. User Manual

Once the application is running, refer to the in-app documentation (accessible via the <span class="material-icons">settings</span> icon) or the [**User Guides**](./packages/frontend/public/docs/GUIDES.md) for instructions on how to use all the features.

## ❤️ Contributing

Contributions are welcome! Whether it's submitting a bug report, proposing a new feature, or creating a new plugin, your help is appreciated. Please feel free to open an issue or submit a pull request.

For major changes or new plugin ideas, please open an issue first to discuss what you would like to change. You can find the **Plugin Development Guide (SDK)** in the in-app documentation or [here](./packages/frontend/public/docs/PLUGIN_DEV.md). You can also reach out at **contact@gesturevision.anonaddy.com**.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.