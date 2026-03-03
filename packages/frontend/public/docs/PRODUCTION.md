# Production Deployment Guide

## Introduction

This guide provides an exhaustive walkthrough for deploying the GestureVision application. There are two primary ways to deploy GestureVision in production: as a **Home Assistant Add-on** (recommended for HA users) or as a **Standalone Docker Container**.

---

## Option A: Home Assistant Add-on (Recommended for HA)

This is the simplest deployment method if you are already using Home Assistant OS or Supervised. It handles SSL (via Ingress), authentication, and plugin configuration automatically.

### 1. Installation
1.  Navigate to **Settings** > **Add-ons** > **Add-on Store**.
2.  Click the **three dots** in the top right > **Repositories**.
3.  Add the GestureVision repository URL:
    `https://github.com/jim1982ha/gesture-vision`
4.  Find **GestureVision** in the list and click **Install**.

### 2. Configuration
Before starting the add-on, switch to the **Configuration** tab:
1.  **`mtx_ice_host`**: Enter the **Local LAN IP** address of your Home Assistant server (e.g., `192.168.1.100`). This is crucial for the video stream (WebRTC) to function correctly.
2.  **`log_level`** (Optional): Set to `info` or `debug` if you need to troubleshoot.
3.  **Devices**: Ensure any USB Webcams you intend to use are plugged in; the add-on maps `/dev/video0`, etc., automatically.

### 3. Usage
1.  Start the add-on.
2.  Click **Open Web UI**.
3.  The **Home Assistant Plugin** will be pre-installed and locked. You do not need to configure the URL or Token; simply select "Home Assistant" as the Action Type when creating gesture configs.

---

## Option B: Standalone Docker Deployment

This setup is designed for generic Linux servers, NAS, or cloud VMs. A reverse proxy is **required** to handle HTTPS and route traffic correctly.

## Server Prerequisites

Before you begin, ensure your host server is properly configured with the following.

### 1. Core Tools
- **Docker Engine & Docker Compose V2:** The entire application stack runs in Docker containers.
- **A Reverse Proxy:** A reverse proxy is **mandatory** for handling HTTPS and secure WebSocket connections. **Nginx Proxy Manager** is the recommended and documented solution. It should be running and connected to a Docker network that other containers can join.
- **A Domain Name:** You must have a domain name (e.g., `gestures.yourdomain.com`) pointing to your server's public IP address.

### 2. Firewall Configuration
Your server's firewall and/or router must allow incoming traffic on the following ports:
- **TCP `80` & `443`:** For web traffic to your reverse proxy.
- **UDP on the port for `MTX_ICE_UDP_PORT`** (default is `8189`): This port is **only required if you want to view RTSP camera streams from outside your local network**. If this port is not open, the rest of the application (including webcam functionality and local RTSP viewing) will still work correctly.

### 3. DNS Configuration (Split-Brain/Hairpin NAT)
For the best experience, especially when using plugins like Home Assistant from within your own network, it's crucial that your public domain resolves to your reverse proxy's **local LAN IP address** when you are on your local network.

- **Recommended:** Use a local DNS server like **AdGuard Home** or **Pi-hole** to create a "DNS Rewrite" or "Local DNS Record".
- **Alternative:** If your router supports "Hairpin NAT" or "NAT Loopback", enabling it can also solve this issue.

## Step 1: Prepare Project Files

On your server, create a directory for the GestureVision application and get the necessary files.
    ```bash
    # Create a directory for the application
    mkdir -p /opt/gesturevision
    cd /opt/gesturevision
    
    # Download or clone the project files into this directory
    # For example: git clone https://github.com/your-username/gesture-vision.git .
    ```

You must have the following files and directories from the project repository:

- `docker-compose.yaml`
- `Dockerfile`
- `package.json` (required by scripts)
- The entire `config/` directory.
- The entire `extensions/` directory.
- The entire `tools/` directory.

1.  **Create Production Environment File:** `cp config/.env.prod.example config/.env.prod`.
2.  **Create Production Config File:** `cp config/config.example.json config/config.prod.json`.
3.  **Prepare Plugin Configurations (if needed):** For example, for Home Assistant (Standalone Mode only):
    ```bash
    cp extensions/plugins/gesture-vision-plugin-home-assistant/config.home-assistant.example.json extensions/plugins/gesture-vision-plugin-home-assistant/config.home-assistant.json
    ```
**Note:** You do not need to run `npm install` on your host server. The Docker build process defined in the `Dockerfile` handles all dependencies.

## Step 2: Reverse Proxy Configuration (Nginx Proxy Manager)

In your NPM UI, add a new Proxy Host.

1.  **Details Tab:**
    - **Domain Names:** Your public domain (e.g., `gestures.yourdomain.com`). This **must match** `APP_EXTERNAL_URL` in your `config/.env.prod` file.
    - **Scheme:** `http`.
    - **Forward Hostname / IP:** `gesturevision` (the service name from `docker-compose.yaml`).
    - **Forward Port:** `80`.
    - Enable **Block Common Exploits** and **Websockets Support**.

2.  **SSL Tab:**
    - Select a valid SSL certificate (e.g., from Let's Encrypt).
    - Enable **Force SSL** and **HTTP/2 Support**.

3.  **Advanced Tab:**
    Paste the following custom Nginx configuration. This is **vital** for routing different types of traffic to the right services inside the container.
  ```nginx
# --- Dynamic WHEP Endpoint Handling (No Auth) ---
# This proxies WHEP (WebRTC) requests directly to the MediaMTX service.
location ~ ^/(.+)/whep$ {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' "$scheme://$host" always;
        add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, SDP' always;
        add_header 'Access-Control-Max-Age' 1728000 always;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' 0;
        return 204;
    }
    # Port must match MTX_WEBRTC_PORT in your .env.prod
    proxy_pass          http://$server:8888;
    proxy_http_version  1.1;
    proxy_set_header    Upgrade $http_upgrade;
    proxy_set_header    Connection "Upgrade";
    proxy_set_header    Host $host;
    proxy_set_header    X-Real-IP $remote_addr;
    proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto $scheme;
    proxy_read_timeout  86400s;
    add_header 'Access-Control-Allow-Origin' "$scheme://$host" always;
    break;
}

# --- Plugin Frontend Assets (Served by internal Nginx) ---
location /plugins/ {
    # The '$server' variable is set by NPM to the container name 'gesturevision'.
    proxy_pass http://$server:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
    break;
}

# --- Backend API & WebSocket Requests ---
location ~ ^/(api|ws)/ {
    # Port must match BACKEND_API_PORT_INTERNAL in your .env.prod
    proxy_pass          http://$server:9001;
    proxy_http_version  1.1;
    proxy_set_header    Upgrade $http_upgrade;
    proxy_set_header    Connection $http_connection;
    proxy_set_header    Host $host;
    proxy_set_header    X-Real-IP $remote_addr;
    proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto $scheme;
    proxy_read_timeout  86400s;
    proxy_redirect      off;
    break;
}
 ```

## Step 3: Deployment

The `tools/update_prod.sh` script provides an interactive guide for configuring your `config/.env.prod` file and deploying the application.

1.  **Make the script executable:** `chmod +x tools/update_prod.sh`
2.  **Run the script:** `./tools/update_prod.sh`. Follow the prompts to review and set your environment variables, then build and start the container.
