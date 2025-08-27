/* FILE: packages/frontend/src/gestures/config-manager.ts */
import type { AppStore } from "#frontend/core/state/app-store.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";

import { normalizeNameForMtx } from "#shared/utils/index.js";

import type {
  GestureConfig,
  PoseConfig,
} from "#shared/types/index.js";

export class GestureConfigManager {
  #editingConfigIndex: number | null = null;
  #appStore: AppStore;
  _uiControllerRef?: UIController;

  constructor(appStore: AppStore, uiControllerRef?: UIController) {
    this.#appStore = appStore;
    this._uiControllerRef = uiControllerRef;
  }
  
  public setUIController(uiController: UIController): void {
    this._uiControllerRef = uiController;
  }

  async updateGestureConfigs(
    newConfigs: Array<GestureConfig | PoseConfig>
  ): Promise<{ success: boolean; message?: string }> {
    const validatedConfigs = this.#validateConfigsArray(newConfigs);
    try {
      await this.#appStore.getState().actions.requestBackendPatch({
        gestureConfigs: validatedConfigs,
      });
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        "[GestureConfigManager] Error during backend update request:",
        error
      );
      return { success: false, message: `Error requesting update: ${message}` };
    }
  }

  getEditingConfigIndex(): number | null {
    return this.#editingConfigIndex;
  }

  setEditingConfigIndex(index: number | null): void {
    if (index !== this.#editingConfigIndex) {
      this.#editingConfigIndex = index;
    }
  }

  #validateConfigsArray(
    configs: Array<GestureConfig | PoseConfig>
  ): Array<GestureConfig | PoseConfig> {
    if (!Array.isArray(configs)) return [];

    const validated = configs
      .map((c): GestureConfig | PoseConfig | null => {
        const isPoseConfig = Object.prototype.hasOwnProperty.call(c, "pose");
        const nameKey = isPoseConfig ? "pose" : "gesture";
        const cAsRecord = c as unknown as Record<string, unknown>;
        const nameValue =
          typeof cAsRecord[nameKey] === "string"
            ? (cAsRecord[nameKey] as string).trim()
            : "UNKNOWN";

        const confidence =
          typeof c.confidence === "number"
            ? parseFloat(String(c.confidence))
            : 50;
        const duration =
          typeof c.duration === "number" && !isNaN(c.duration)
            ? parseFloat(String(c.duration))
            : 1.0;

        const baseConfig: Partial<GestureConfig | PoseConfig> = {
          duration: duration,
          actionConfig: c.actionConfig || null,
        };

        if (isPoseConfig) {
          (baseConfig as PoseConfig).pose = nameValue;
        } else {
          (baseConfig as GestureConfig).gesture = nameValue;
        }

        if (
          typeof c.confidence === "number" &&
          c.confidence >= 0 &&
          c.confidence <= 100
        ) {
          baseConfig.confidence = confidence;
        }

        if (!isPoseConfig) {
          if (baseConfig.confidence === undefined) {
            baseConfig.confidence = confidence;
          }
        }
        return baseConfig as GestureConfig | PoseConfig;
      })
      .filter((c): c is GestureConfig | PoseConfig => {
        if (!c) return false;
        const nameValue = 'gesture' in c ? c.gesture : c.pose;
        const isPoseConfig = Object.prototype.hasOwnProperty.call(c, "pose");
        const isConfidenceValid =
          (isPoseConfig && c.confidence === undefined) ||
          (typeof c.confidence === "number" &&
            c.confidence >= 0 &&
            c.confidence <= 100);
        const isDurationValid = c.duration !== undefined && c.duration > 0;
        return !!(
          nameValue &&
          nameValue !== "NONE" &&
          isConfidenceValid &&
          isDurationValid
        );
      });
    return validated;
  }

  isDuplicateConfig(
    newConfig: GestureConfig | PoseConfig,
    ignoreIndex: number | null = null
  ): boolean {
    const nameKey = "pose" in newConfig ? "pose" : "gesture";
    const newConfigName = (newConfig as unknown as Record<string, unknown>)[
      nameKey
    ] as string;
    const normalizedNewName = normalizeNameForMtx(newConfigName).toUpperCase();

    const currentConfigs = this.#appStore.getState().gestureConfigs || [];
    return currentConfigs.some((existingConfig, i) => {
      if (i === ignoreIndex) return false;
      const existingNameKey = "pose" in existingConfig ? "pose" : "gesture";
      const existingName = (
        existingConfig as unknown as Record<string, unknown>
      )[existingNameKey] as string;
      const normalizedExistingName =
        normalizeNameForMtx(existingName).toUpperCase();
      return normalizedExistingName === normalizedNewName;
    });
  }
}