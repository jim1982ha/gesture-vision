## Introduction

This guide provides an exhaustive walkthrough for setting up and running the GestureVision application locally for development. It is intended for a new engineer who has just cloned the repository. The development environment uses Docker Compose to manage a container that includes all necessary services with live-reloading for an efficient workflow.

## Host System Prerequisites

Before you begin, ensure your development machine has the following software installed and configured.

### 1. Core Tools
- **Git:** For cloning the repository.
- **Node.js & npm:** v22 or later is recommended. Required for installing dependencies and running project scripts.
- **Docker Engine & Docker Compose V2:** Essential for building and running the containerized development environment. This manages the Node.js backend, Vite frontend, and MediaMTX services automatically.
- **A Code Editor:** Visual Studio Code with the ESLint extension is highly recommended for the best experience.

### 2. Networking Prerequisites (Optional but Recommended)

This setup is required **only if you plan to develop or test plugins that connect to other services on your local network**, such as the Home Assistant plugin.

**The Goal:** Your development machine must be able to resolve the hostname of your local services (e.g., `homeassistant.local` or `homeassistant.yourdomain.com`) to their **local LAN IP address**.

#### Option A: Using a Local DNS Server (Recommended)
If you use a local DNS server like Pi-hole or AdGuard Home, this is the best approach.
1.  Navigate to your DNS server's administrative dashboard.
2.  Find the "DNS Rewrites" or "Local DNS Records" section.
3.  Create a new entry that maps the domain name of your service (e.g., `homeassistant.yourdomain.com`) to the **local LAN IP address** of your reverse proxy (e.g., `192.168.1.10`).

#### Option B: Editing the `hosts` File
If you don't have a local DNS server, you can manually force your development machine to resolve the domain to a specific IP.

- **Linux/macOS:** Edit `/etc/hosts` with `sudo` privileges.
- **Windows:** Edit `C:\Windows\System32\drivers\etc\hosts` as an Administrator.

Add a line to the file with the format `<LOCAL_IP_OF_PROXY> <YOUR_SERVICE_DOMAIN>`:
```
192.168.1.10   homeassistant.yourdomain.com
```

## Step 1: Initial Project Setup
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jim1982ha/gesture-vision-app.git
    cd gesture-vision-app
    ```
2.  **Install Root Dependencies:**
    ```bash
    npm install
    ```
3.  **Create Development Configuration Files:**
    ```bash
    cp config/config.example.json config/config.dev.json
    cp config/.env.dev.example config/.env.dev
    ```
4.  **Create Plugin Configs (Optional):** To test plugins that require their own configuration, copy their example files. For example:
    ```bash
    cp extensions/plugins/gesture-vision-plugin-home-assistant/config.home-assistant.example.json extensions/plugins/gesture-vision-plugin-home-assistant/config.home-assistant.json
    ```

## Step 2: Configure Your Development Environment

Edit the `config/.env.dev` file. The most critical variable to set is `MTX_ICE_HOST`.

| Variable                        | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `MTX_ICE_HOST`                  | **Crucial.** Your development computer's LAN IP address (e.g., `192.168.1.100`). This is required for testing RTSP camera streams. |
| `DEV_VITE_PORT`                 | The host port for the Vite dev server (e.g., `https://localhost:8001`). |
| `VITE_DEV_HA_DEFAULT_URL`       | (Optional) Pre-fills the Home Assistant URL in the UI to save time during testing. |
| `DEV_IMAGE_NAME`                | Defines the Docker image name/tag. `${APP_VERSION}` is auto-substituted. |

## Step 3: Running the Development Environment

The `tools/update_dev.sh` script automates the entire process of building the Docker image and starting all services.

1.  **Make it executable:** `chmod +x tools/update_dev.sh`
2.  **Run it:** `./tools/update_dev.sh`

The script will keep the terminal attached to show live logs from all services.

## Step 4: Development Workflow
- **Access UI:** Open your browser to the URL provided by the script (usually `https://localhost:8001`).
- **Live Editing:**
  - **Frontend (`packages/frontend`):** Vite provides Hot Module Replacement (HMR) for instant UI updates.
  - **Backend, Shared, Plugins (`packages/*`, `extensions/*`):** Nodemon watches for file changes, recompiles TypeScript, and restarts the backend server automatically.

## Managing Plugins as Separate Repositories

This project is configured for a specific workflow where each plugin is managed in its own Git repository. The `tools/update_plugins.sh` script automates synchronizing your work from this monorepo to the individual plugin repositories.

- **Workflow:**
    1. Make and test your plugin changes within the `extensions/plugins/` directory of this project.
    2. Once you are ready to publish, run the `tools/update_plugins.sh` script. It will copy your changes to a separate directory containing the individual plugin git repositories, then commit and push them.
- **Configuration:** The script must be configured with the path to your external plugin repositories. See the script's help menu (`-h`) for details.