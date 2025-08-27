# Developing GestureVision Plugins

## Introduction

Welcome to the GestureVision Plugin Development Guide! This document provides everything you need to know to create your own plugins and extend the capabilities of the GestureVision platform.

The plugin system is the core of GestureVision's extensibility. It allows developers to create custom actions that are triggered by recognized gestures, integrate with third-party services, and even add new UI components to the application.

## Plugin Structure

A plugin is a self-contained directory within the `extensions/plugins/` folder of the project. Each plugin must have a specific file structure.

```
extensions/plugins/
└── my-cool-plugin/
    ├── plugin.json                 # Required: The plugin manifest.
    ├── backend.plugin.ts           # Optional: Backend logic (action handlers, API routes).
    ├── frontend/
    │   ├── index.js                # Optional: Frontend entry point for UI components.
    │   └── style.css               # Optional: Custom CSS for your plugin's UI.
    └── locales/
        ├── en.json                 # Optional: English translation strings.
        └── fr.json                 # Optional: French translation strings.
```

### `plugin.json` (The Manifest)

This is the most important file. It tells GestureVision what your plugin is, what it does, and where to find its code.

```json
{
  "id": "my-cool-plugin",
  "nameKey": "pluginMyCoolName",
  "descriptionKey": "pluginMyCoolDescription",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": {
    "type": "material-icons",
    "name": "extension"
  },
  "capabilities": {
    "hasGlobalSettings": true,
    "providesActions": true,
    "providesUIContribution": true
  },
  "globalConfigFileName": "config.my-cool-plugin.json",
  "backendEntry": "backend.plugin.js",
  "frontendEntry": "frontend/index.js",
  "frontendStyle": "frontend/style.css"
}
```

-   **`id`**: A unique, machine-friendly identifier. **Must match the directory name.**
-   **`nameKey`**: A key that maps to a string in your `locales/*.json` files for the plugin's display name.
-   **`capabilities`**: A crucial object defining what the plugin does:
    -   `hasGlobalSettings`: Set to `true` if your plugin needs a global configuration screen in the "Plugins" tab.
    -   `providesActions`: Set to `true` if your plugin adds new options to the "Action Type" dropdown.
    -   `providesUIContribution`: Set to `true` if your plugin adds custom UI elements to designated "slots" in the application UI (e.g., a button in the header).
-   **`globalConfigFileName`**: If `hasGlobalSettings` is true, this is the name of the JSON file that will store its settings.
-   **`backendEntry` / `frontendEntry` / `frontendStyle`**: Paths to your main backend, frontend, and optional CSS files.

### Backend Development (`backend.plugin.ts`)

Your backend file must export a default class that extends the `BaseBackendPlugin` class.

**Key Responsibilities:**
1.  **Provide an Action Handler:** If `providesActions` is `true`, your plugin class must instantiate and provide an `ActionHandler`. This handler's `execute` method contains the logic that runs when a gesture triggers your action.
2.  **Define Validation Schemas:** If your plugin has global or action-specific settings, provide Zod schemas to validate them. This ensures data integrity.
3.  **Create API Routes (Optional):** If your plugin needs to expose custom API endpoints, you can return an Express Router.

### Frontend Development (`frontend/index.js`)

Your frontend module is a standard JavaScript ES Module that exports a default object.

**Key Responsibilities:**
1.  **Provide UI Component Factories:** If your plugin has settings, you provide functions that define the UI components.
    -   `createGlobalSettingsComponent`: Creates the UI for the "Plugins" tab.
    -   `actionSettingsFields`: Defines the form fields that appear when a user selects your plugin as an "Action Type".
2.  **Provide an Action Display Renderer:** The `getActionDisplayDetails` function returns a structured array that defines how a configured action should be displayed on the main gesture cards.
3.  **Contribute UI (Optional):** The `init` function is called once when the plugin is loaded. If `providesUIContribution` is `true`, you can use the `pluginUIService` from the context to register custom HTML elements into specific UI "slots".
    -   **Example:** `context.pluginUIService.registerContribution('header-controls', myButton, manifest.id);`

## Getting Started: The Plugin Template

The easiest way to start is to copy an existing simple plugin (like Webhook or OS Command) and modify it. This provides a fully-functional, well-commented starting point for your own plugin.

## Development Workflow

1.  Run the GestureVision development environment using `./tools/update_dev.sh`.
2.  Create your new plugin directory in `extensions/plugins/`.
3.  As you edit your plugin's `.ts` files, the backend will automatically recompile and restart.
4.  As you edit your plugin's frontend `.js` or `.css` files, the Vite dev server will automatically reload the UI.
5.  Use the application's UI to configure and test your new plugin's actions and settings pages.

Happy building!