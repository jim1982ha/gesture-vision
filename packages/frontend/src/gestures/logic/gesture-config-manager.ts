/* FILE: packages/frontend/src/gestures/logic/gesture-config-manager.ts */
import type { AppStore } from "#frontend/core/state/app-store.js";
import { BUILT_IN_HAND_GESTURES, getGestureDisplayInfo, normalizeNameForMtx, type CustomGestureMetadata, type GestureConfig, type PoseConfig } from "#shared/index.js";

export class GestureConfigManager {
    #appStore: AppStore;
    #gestureConfigsCache: (GestureConfig | PoseConfig)[] = [];
    #customMetadataCache: CustomGestureMetadata[] = [];
    #unsubscribeStore: () => void;

    constructor(appStore: AppStore) {
        this.#appStore = appStore;
        this.#gestureConfigsCache = this.#appStore.getState().gestureConfigs || [];
        this.#customMetadataCache = this.#appStore.getState().customGestureMetadataList || [];
        this.#unsubscribeStore = this.#appStore.subscribe((state, prevState) => {
            if (state.gestureConfigs !== prevState.gestureConfigs) this.#gestureConfigsCache = state.gestureConfigs || [];
            if (state.customGestureMetadataList !== prevState.customGestureMetadataList) this.#customMetadataCache = state.customGestureMetadataList || [];
        });
    }

    public destroy(): void { this.#unsubscribeStore(); }

    public getActiveConfig(gestureName: string): GestureConfig | PoseConfig | null {
        if (!gestureName || typeof gestureName !== 'string') return null;
        const isPotentiallyBuiltIn = (BUILT_IN_HAND_GESTURES as readonly string[]).includes(gestureName.toUpperCase());
        const normalizedSearchName = isPotentiallyBuiltIn ? normalizeNameForMtx(gestureName).toUpperCase() : gestureName;
        
        const config = this.#gestureConfigsCache.find(c => {
            const nameToCheck = 'gesture' in c ? c.gesture : c.pose;
            if (!nameToCheck || typeof nameToCheck !== 'string') return false;
            const isCurrentConfigPotentiallyBuiltIn = (BUILT_IN_HAND_GESTURES as readonly string[]).includes(nameToCheck.toUpperCase());
            const normalizedConfigName = isCurrentConfigPotentiallyBuiltIn ? normalizeNameForMtx(nameToCheck).toUpperCase() : nameToCheck;
            return normalizedConfigName === normalizedSearchName;
        });
        
        return config && this.#isActiveConfig(config) ? config : null;
    }

    #isActiveConfig(config: GestureConfig | PoseConfig): boolean {
        const state = this.#appStore.getState();
        const gestureName = 'gesture' in config ? config.gesture : config.pose;
        if (!gestureName) return false;

        const { category } = getGestureDisplayInfo(gestureName, this.#customMetadataCache);
        switch (category) {
            case 'BUILT_IN_HAND': return state.enableBuiltInHandGestures;
            case 'CUSTOM_HAND': return state.enableCustomHandGestures;
            case 'CUSTOM_POSE': return state.enablePoseProcessing;
            default: return false;
        }
    }
}