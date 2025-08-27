/* FILE: packages/frontend/src/ui/renderers/config-list-renderer.ts */
// Renders the list of gesture configuration cards.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { RendererElements } from '#frontend/ui/ui-renderer-core.js';
import { setElementVisibility } from '#frontend/ui/helpers/index.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';

import { translate } from '#shared/services/translations.js';
import {
  getActionIconDetails,
  getGestureCategoryIconDetails,
  getGestureDisplayInfo,
} from '#frontend/ui/helpers/index.js';

import type { ActionDisplayDetail, GestureConfig, PoseConfig, CustomGestureMetadata } from '#shared/types/index.js';
import type { GestureCategoryIconType } from '#shared/constants/index.js';

type CardStatus = { isActive: true; reason: null } | { isActive: false; reason: 'feature_disabled' | 'plugin_missing' | 'plugin_disabled' };

interface RenderOptions {
    swapTitleAndFooter?: boolean;
}

async function getDetailsHtml(
    entry: GestureConfig | PoseConfig,
    pluginUIServiceRef: PluginUIService
): Promise<string> {
    const actionConfig = entry.actionConfig;
    const pluginId = actionConfig?.pluginId;

    if (!pluginId || pluginId === 'none') return "";

    await pluginUIServiceRef.loadPluginFrontendModule(pluginId);
    const detailRenderer = pluginUIServiceRef.getActionDisplayDetailsRenderer(pluginId);

    if (detailRenderer) {
        try {
            const context = pluginUIServiceRef.getPluginUIContext(pluginId);
            const detailsArray: ActionDisplayDetail[] = detailRenderer(actionConfig.settings, context);
            return detailsArray.map(detail => {
                let iconHtml = '';
                if (detail.icon) {
                    const isMdi = detail.iconType === 'mdi' || detail.icon.startsWith('mdi-');
                    const iconClass = isMdi ? `card-detail-icon mdi ${detail.icon}` : 'card-detail-icon material-icons';
                    const iconContent = isMdi ? '' : detail.icon;
                    iconHtml = `<span class="${iconClass}">${iconContent}</span>`;
                }
                return `<div class="card-detail-line">${iconHtml}<span class="card-detail-value ${detail.allowWrap ? 'allow-wrap' : ''}">${detail.value}</span></div>`;
            }).join('');
        } catch (renderError) {
            console.warn(`[ConfigListRenderer] Error rendering details for plugin '${pluginId}':`, renderError);
        }
    } else if (actionConfig?.settings && typeof actionConfig.settings === 'object' && Object.keys(actionConfig.settings).length > 0) {
        // Fallback for simple plugins without a custom renderer
        const manifest = pluginUIServiceRef.getPluginManifest(pluginId);
        const pluginIconDetails = getActionIconDetails(manifest);
        return Object.values(actionConfig.settings).slice(0, 2).map((value, index) => {
            const displayValue = (typeof value === 'object' ? JSON.stringify(value) : String(value)) || 'N/A';
            const iconDetails = index === 0 ? pluginIconDetails : getActionIconDetails(null); // Use plugin icon for first detail, generic for others
            const isMdi = iconDetails.iconType === 'mdi' || iconDetails.iconName.startsWith('mdi-');
            const iconClass = `card-detail-icon ${isMdi ? `mdi ${iconDetails.iconName}` : 'material-icons'}`;
            const iconContent = isMdi ? '' : iconDetails.iconName;
            const iconHtml = `<span class="${iconClass}" title="${Object.keys(actionConfig.settings as Record<string, unknown>)[index]}">${iconContent}</span>`;
            return `<div class="card-detail-line">${iconHtml}<span class="card-detail-value">${displayValue}</span></div>`;
        }).join('');
    }
    return "";
}

export async function renderConfigList(
  elements: Partial<RendererElements>,
  configsData?: Array<GestureConfig | PoseConfig> | null,
  appStore?: AppStore | null,
  pluginUIServiceRef?: PluginUIService | null,
  uiControllerRef?: UIController | null,
  options: RenderOptions = {}
): Promise<void> {
  const activeListDiv = elements.configListDiv;
  const inactiveListDiv = elements.inactiveConfigListDiv;

  if (!activeListDiv) {
    console.error("[ConfigListRenderer] Main list container (configListDiv) is missing.");
    return;
  }
  
  let configs: Array<GestureConfig | PoseConfig> = configsData || appStore?.getState().gestureConfigs || [];

  if (!pluginUIServiceRef || !appStore) return;
  
  const getGestureConfigCategory = (config: GestureConfig | PoseConfig, customMetaList: CustomGestureMetadata[]): GestureCategoryIconType => {
      const name = 'pose' in config ? (config as PoseConfig).pose : (config as GestureConfig).gesture;
      return getGestureDisplayInfo(name, customMetaList).category;
  };
  
  const getCardStatus = (config: GestureConfig | PoseConfig, appStoreRef: AppStore, puiServiceRef: PluginUIService, customMetaList: CustomGestureMetadata[]): CardStatus => {
    const state = appStoreRef.getState();
    
    const actionPluginId = config.actionConfig?.pluginId;
    if (actionPluginId && actionPluginId !== 'none') {
        const manifest = puiServiceRef.getPluginManifest(actionPluginId);
        if (!manifest) return { isActive: false, reason: 'plugin_missing' };
        if (manifest.status === 'disabled') return { isActive: false, reason: 'plugin_disabled' };
    }

    const category = getGestureConfigCategory(config, customMetaList);
    const name = 'pose' in config ? (config as PoseConfig).pose : (config as GestureConfig).gesture;

    if (category === "UNKNOWN" || ((category === "CUSTOM_HAND" || category === "CUSTOM_POSE") && !customMetaList.some(meta => meta.name === name))) {
        return { isActive: false, reason: 'feature_disabled' }; 
    }

    let isFeatureEnabled = false;
    switch (category) {
      case "BUILT_IN_HAND": isFeatureEnabled = state.enableBuiltInHandGestures; break;
      case "CUSTOM_HAND": isFeatureEnabled = state.enableCustomHandGestures; break;
      case "CUSTOM_POSE": isFeatureEnabled = state.enablePoseProcessing; break;
    }

    if (!isFeatureEnabled) return { isActive: false, reason: 'feature_disabled' };
    
    return { isActive: true, reason: null };
  };
  
  const originalNameBeingEdited = uiControllerRef?.getOriginalNameBeingEdited() ?? null;
  const customMetadataList = appStore.getState().customGestureMetadataList || [];
  
  configs = [...configs].sort((a: GestureConfig | PoseConfig, b: GestureConfig | PoseConfig) => {
    const aStatus = getCardStatus(a, appStore, pluginUIServiceRef, customMetadataList);
    const bStatus = getCardStatus(b, appStore, pluginUIServiceRef, customMetadataList);
    if (aStatus.isActive !== bStatus.isActive) return aStatus.isActive ? -1 : 1;
    const nameA = ('pose' in a ? (a as PoseConfig).pose : (a as GestureConfig).gesture).toLowerCase();
    const nameB = ('pose' in b ? b.pose : b.gesture).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  const activeFragment = document.createDocumentFragment();
  const inactiveFragment = document.createDocumentFragment();
  let activeCount = 0;
  let inactiveCount = 0;

  for (const config of configs) {
    const cardStatus = getCardStatus(config, appStore, pluginUIServiceRef, customMetadataList);
    const name = 'pose' in config ? (config as PoseConfig).pose : (config as GestureConfig).gesture;
    const { formattedName, category } = getGestureDisplayInfo(name, customMetadataList);
    const gestureDisplayName = category === 'BUILT_IN_HAND' ? translate(formattedName, { defaultValue: formattedName }) : formattedName;
    
    let itemClasses = "config-item card-item-clickable";
    let statusTextForFooter = "";
    if (originalNameBeingEdited === name) itemClasses += " is-editing-highlight";
    
    if (!cardStatus.isActive) {
        if (cardStatus.reason === 'plugin_missing' || cardStatus.reason === 'plugin_disabled') {
            itemClasses += " plugin-missing";
            const reasonTextKey = cardStatus.reason === 'plugin_disabled' ? 'pluginDisabled' : 'pluginMissing';
            statusTextForFooter = `<span class="footer-status-text error-text">${translate(reasonTextKey)}</span>`;
        } else {
            itemClasses += " config-item-unavailable";
            statusTextForFooter = `<span class="footer-status-text">${translate("customFeatureDisabled")}</span>`;
        }
    }
    
    const actionDetailsHtml = await getDetailsHtml(config, pluginUIServiceRef);
  
    let pillsContent = "";
    if (cardStatus.isActive) { 
        if (config.confidence !== undefined) pillsContent += `<span class="confidence-pill">${config.confidence}%</span>`;
        if (config.duration) pillsContent += `<span class="duration-pill">${config.duration}s</span>`;
    }
    
    let actionTypeDisplay = translate('actionTypeNone');
    const pluginId = config.actionConfig?.pluginId;
    if (pluginId && pluginId !== 'none') {
        const manifest = pluginUIServiceRef.getPluginManifest(pluginId);
        if (manifest?.nameKey) actionTypeDisplay = translate(manifest.nameKey, { defaultValue: pluginId });
    }

    // --- MODIFICATION: Conditionally swap title and footer content based on options ---
    const cardTitle = options.swapTitleAndFooter ? actionTypeDisplay : gestureDisplayName;
    const footerTextContent = options.swapTitleAndFooter ? gestureDisplayName : actionTypeDisplay;

    const footerText = `${footerTextContent}${statusTextForFooter ? `<span class="card-footer-separator">|</span>${statusTextForFooter}` : ''}`;
    const pillsHtml = pillsContent ? `<span class="card-footer-separator">|</span><span class="footer-pills-wrapper">${pillsContent}</span>` : '';
    const footerHtml = `<div class="card-footer"><span>${footerText}</span>${pillsHtml}</div>`;
    const cardTooltip = translate('editTooltip', { item: name || 'item' });
    
    const cardElement = createCardElement({
      ...getGestureCategoryIconDetails(category),
      title: cardTitle,
      actionButtonsHtml: `<button type="button" class="btn btn-icon btn-icon-danger delete-btn" title="${translate('deleteTooltip',{item:name || 'item'})}" aria-label="${translate('deleteTooltip',{item:name || 'item'})}"><span class="material-icons">delete</span></button>`,
      detailsHtml: actionDetailsHtml,
      footerHtml,
      itemClasses,
      datasetAttributes: { gestureName: name || '' },
      titleAttribute: cardTooltip,
      ariaLabel: cardTooltip
    });

    if (cardStatus.isActive) {
      activeFragment.appendChild(cardElement);
      activeCount++;
    } else {
      inactiveFragment.appendChild(cardElement);
      inactiveCount++;
    }
  }

  // Animation handling
  [activeListDiv, inactiveListDiv].forEach(container => {
    if (container) {
      container.classList.add('is-rebuilding');
      container.innerHTML = ""; // Clear existing content
    }
  });

  activeListDiv.appendChild(activeFragment);
  
  if (inactiveListDiv) {
    inactiveListDiv.appendChild(inactiveFragment);
  } else {
    activeListDiv.appendChild(inactiveFragment);
  }
  
  if (activeCount === 0 && inactiveCount === 0) {
      activeListDiv.innerHTML = `<p class="list-placeholder">${translate("noGesturesConfigured")}</p>`;
  }

  if (inactiveListDiv) {
    setElementVisibility(inactiveListDiv, inactiveCount > 0, 'grid');
  }

  // Remove animation class after a short delay
  requestAnimationFrame(() => {
    setTimeout(() => {
        [activeListDiv, inactiveListDiv].forEach(container => {
            if (container) container.classList.remove('is-rebuilding');
        });
    }, 400); // Duration of the animation
  });
}