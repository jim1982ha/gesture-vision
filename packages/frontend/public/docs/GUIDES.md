<!-- FILE: packages/frontend/public/docs/GUIDES.md -->
# GestureVision User Guides

## Introduction

Welcome to GestureVision! This application allows you to use your computer's webcam or connect to RTSP camera streams to recognize hand gestures and body poses. Based on these recognized movements, you can trigger a variety of actions through installed plugins, such as controlling smart home devices, sending MQTT messages, or executing OS commands.

This guide covers how to use the main features of the application effectively.

## Understanding the User Interface

### 1. Main Video Area & Overlays
- **Live Feed:** Displays video from your selected camera source.
- **Gesture/Pose Information (Top Center):** Shows the currently detected gesture and its real-time confidence level.
- **Progress Rings (Center):** The inner ring shows gesture hold progress; the outer ring shows the global cooldown timer.
- **Interactive Overlays:**
    - **Dashboard:** An optional grid of buttons that can be "clicked" with your gestures for hands-free control.
    - **ROI Editor (RTSP):** An editable overlay to define the processing region for a camera.
    - **Tuning Panels:** Sliders for adjusting AI confidence and display settings in real-time.

### 2. Configured Actions List
Below the video, this section displays all your configured gesture-to-action mappings as cards.
- **Disabled/Unavailable Cards:** A card will appear dimmed if its required feature (e.g., Pose Processing) is turned off, or if its required plugin is missing or disabled.

### 3. Top Navigation Bar
- **Feature & Landmark Toggles:** Buttons to enable/disable core features (Built-in Gestures, Custom Gestures, Pose Processing) and landmark visibility.
- **Dashboard Button (<span class="material-icons" style="font-size:1em;vertical-align:middle;">dashboard</span>):** Activates the interactive Dashboard overlay.
- **Settings Button (<span class="material-icons" style="font-size:1em;vertical-align:middle;">settings</span>):** Opens the main Configuration modal.

### 4. Sidebars (Desktop) / Bottom Navigation (Mobile)
- **Gesture Settings (<span class="material-icons" style="font-size:1em;vertical-align:middle;">tune</span>):** Create new gesture-to-action mappings.
- **History (<span class="material-icons" style="font-size:1em;vertical-align:middle;">history</span>):** View a log of recently triggered actions.

### 5. Settings Modal (Configuration)
- **General:** Set the global cooldown and target processing FPS.
- **Custom Gestures:** Manage your custom-made gestures. This is where you launch the **Gesture Studio**.
- **Plugins:** Install, uninstall, enable, or disable plugins. Configure global settings for plugins that require them (e.g., Home Assistant URL/Token).
- **RTSP Sources:** Add and manage your IP camera streams.
- **Appearance:** Choose your preferred UI theme.

## How to Use

### Configuring a New Gesture Action
1.  Open the **Gesture Settings** sidebar/panel.
2.  Use the **"Gesture"** dropdown to select a built-in or custom gesture.
3.  Set the **Confidence** threshold and **Hold Duration** required.
4.  Select an **Action Type** (e.g., Home Assistant, Webhook). This will reveal plugin-specific fields.
5.  Fill in the action details and click **Add Configuration**.

### Creating a Custom Gesture with the Gesture Studio
1.  Navigate to **Settings -> Custom Gestures**.
2.  Click **"Create..."** to launch the Gesture Studio.
3.  Provide a name and select the gesture type (Hand or Pose).
4.  Follow the on-screen instructions to start your camera and record several samples of yourself performing the gesture.
5.  Once you have enough samples, click **"Generate"**.
6.  You can then test the new gesture in real-time and adjust its **Tolerance**. When satisfied, click **"Save Gesture"**.
7.  Your new gesture is now available to be used in the main **Gesture Settings** panel.

### Using the Dashboard
1.  Click the **Dashboard icon** (<span class="material-icons" style="font-size:1em;vertical-align:middle;">dashboard</span>) in the top header to activate the overlay.
2.  Click **"Edit Dashboard"**.
3.  Click **"Add Widget"** to create a new button. Configure its action just like you would for a gesture.
4.  Drag and drop widgets to arrange your layout.
5.  Click **"Save Layout"** to exit edit mode.
6.  To "click" a widget, simply point your index finger at it and hold until the circular progress bar fills.