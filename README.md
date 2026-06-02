# GestureVision: AI-Powered Gesture Control for Your Digital World

<p align="center">
  <img src="./packages/frontend/public/icons/icon-128.webp" alt="GestureVision Logo" width="128">
</p>

<p align="center">
  <strong>Intuitive Gesture Control for a Smarter World.</strong>
</p>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-use-cases">Use Cases</a> •
  <a href="#-default-workflow">Default Workflow</a> •
  <a href="#-flavors">Flavors</a> •
  <a href="#-architecture-overview">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-script-tools">Script Tools</a> •
  <a href="#-contributing">Contributing</a>
</p>
<p align="center">
    <img src="https://img.shields.io/github/v/release/jim1982ha/gesture-vision?label=Latest%20Release" alt="Latest Release" />
    <img src="https://img.shields.io/badge/aarch64-yes-green.svg" alt="aarch64 Support" />
    <img src="https://img.shields.io/badge/amd64-yes-green.svg" alt="amd64 Support" />
</p>

---

GestureVision is an innovative open-source web application that transforms how you interact with technology. By leveraging AI-powered computer vision on webcam or RTSP camera feeds, GestureVision translates natural human movements into configurable actions via a flexible plugin system, supporting integrations like Home Assistant, MQTT, webhooks, and OS commands.

It addresses the need for more natural, accessible, and efficient human-machine interfaces, reducing reliance on physical controls or voice commands.

## ✨ Key Features

-   **Real-time Gesture & Pose Recognition:** Utilizes Google's MediaPipe for high-performance hand and pose detection that runs locally for full privacy.
-   **Versatile Video Sources:**
    -   **Webcam:** Processes your camera feed directly in the browser.
    -   **RTSP IP Cameras:** Connect to existing security or IP cameras via WebRTC.
-   **Powerful Plugin System:** Trigger actions in other systems:
    -   **Home Assistant:** Control lights, switches, scenes, and any entity.
    -   **MQTT & Webhooks:** Publish custom messages and send HTTP requests.
    -   **OS Commands:** Control your computer via a companion app.
-   **Gesture Studio:** Visually record and create unique custom gestures.
-   **Interactive Dashboard:** A hands-free UI overlay where you can "click" widgets using gestures.

## 💡 Use Cases

GestureVision makes interacting with technology magically hands-free in scenarios where physical touch or voice isn't practical or possible:

1.  **Smart Kitchen:** Control lighting, set timers, or skip a song with messy hands while cooking.
2.  **Accessibility:** Enable smart home interaction for individuals who cannot use traditional interfaces or speech recognition.
3.  **Hands-Free Presentations:** Advance slides, zoom, or point using intuitive hand swipes and gestures without holding a clicker.
4.  **Workshop/Garage Operations:** Trigger tools, dust collectors, or smart plugs while wearing heavy gloves.
5.  **Interactive Displays:** Build magical kiosk experiences for retail, museums, or events without deploying touchscreens.

## 🔄 Default Workflow

Using GestureVision follows a streamlined sequence to go from camera setup to executing physical actions:

1.  **Launch the Application**: Open the web dashboard from your browser.
2.  **Select a Video Source**: Choose a local USB webcam or configure an RTSP stream via the frontend UI.
3.  **Add/Configure Plugins**: Navigate to the Plugins tab. Install and configure the plugin corresponding to your target system (e.g., provide Home Assistant credentials and server URL).
4.  **Define a Gesture Mapping**: In the settings, link a specific detected gesture (e.g., "Thumbs Up" or a custom recorded gesture) to your target plugin's action (e.g., "Home Assistant -> Turn On Living Room Light").
5.  **Trigger Actions**: Step in front of the camera and perform the gesture. The AI detects the feature locally in the browser, sends it to the GestureVision backend, which proxies the request to the configured integration via the plugin.

## 🍦 GestureVision Flavors

GestureVision is distributed in two main "flavors", specifically tailored for different hosting environments:

1.  **Home Assistant Add-on (Recommended for HA Users)**: Integrated seamlessly into the Home Assistant Supervisor ecosystem. Handles credentials, ingest networking, and bootstrapping automatically. The Home Assistant plugin (for interacting with HA APIs) is forcefully enabled and dynamically fetched (bootstrapped) directly on initialization without manual downloading.
2.  **Standalone Production / Local Dev (Dockerized)**: Distributed as standard docker containers for deployment via Docker Compose or manual setups on standard Linux servers. Plugins must be sourced correctly or loaded into the configuration directories. Setup scripts streamline local operations.

## 🏗️ Architecture Overview (Technical Details)

GestureVision is a full-stack container-based webapp offering strict decoupling between the inference engine, core application, and extension plugins:

-   **Frontend (`packages/frontend`)**: Built with Vite and React. **AI processing (MediaPipe) runs locally in the browser within a Web Worker**, keeping the main UI thread performant, guaranteeing privacy, and offloading heavy compute from the server.
-   **Backend (`packages/backend`)**: A lightweight Node.js/Express service. It acts securely as a WebSocket router, plugin manager, and state manager. It handles requests dynamically relying only on initialized decoupled plugins over an agnostic event bus.
-   **Streaming (MediaMTX)**: Uses MediaMTX internally for low-latency ingest-to-browser RTSP streaming using the WHEP WebRTC protocol.
-   **Bootstrap Mechanism**: Especially in the HA Add-on mode, missing mandatory plugins can be fetched gracefully via a configuration injection script pulling from a declared GitHub repo upon container start, ensuring the core container image remains isolated, clean, and extensible.
-   **Dynamic Decorators**: Plugins provide standardized schema schemas (via Zod types) yielding dynamically rendered forms within the React frontend via a specialized UI service.

## 🚀 Getting Started

This project is managed as a monorepo. All commands should be run from the project root.

### 1. Home Assistant Add-on (Easiest)

1.  **Add Repository:** Go to your Home Assistant Add-on Store -> Repositories and add:
    `https://github.com/jim1982ha/gesture-vision`
2.  **Install:** Find "GestureVision" and click Install.
3.  **Configure:** In the Configuration tab, set `mtx_ice_host` to your Home Assistant LAN IP address.
4.  **Start:** Start the add-on and open the Web UI.

### 2. Standalone Docker (Production)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    ```
2.  **Run:**
    ```bash
    chmod +x ./tools/update_prod.sh
    ./tools/update_prod.sh
    ```

### 3. Local Development

1.  **Clone and Install:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision.git
    cd gesture-vision
    npm install
    ```
2.  **Run:**
    ```bash
    chmod +x ./tools/update_dev.sh
    ./tools/update_dev.sh
    ```

## 🛠 Script Tools

GestureVision provides various automation shell scripts in the `/tools` directory to streamline continuous lifecycle management and local testing:

-   `update_dev.sh`: Intelligently cleans, builds, and launches the development docker orchestration. Evaluates necessary environment overrides safely without clobbering manual edits.
-   `update_prod.sh`: Cleans and starts the platform configured specifically for production network footprints.
-   `bump_version.sh`: Sweeps the monolith identifying config and package.json files, updating version tags consistently for deployments.
-   `release.sh`: Used by CI to package releases, attach github release tags, push docker templates, and trigger updates.
-   `update_images.sh`: Fetches or rebuilds baseline MediaPipe/MediaMTX dependent remote images to maintain compatibility.

## ❤️ Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request. For major changes, please open an issue first to discuss what you would like to change. You can also reach out at **contact@gesturevision.anonaddy.com**.

The [**Plugin Development Guide**](./packages/frontend/public/docs/PLUGIN_DEV.md) is available to help you get started with creating your own extensions.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file, for details.