/* FILE: packages/frontend/src/ui/renderers/config-list-renderer.ts */
// Renders the list of gesture configuration cards.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { createCardElement, type CardFooterConfig, type ActionButtonConfig } from '#frontend/ui/helpers/card-utils.js';
import { getGestureDisplayInfo, getActionIconDetails } from '#frontend/ui/helpers/index.js';
import type { ActionDisplayDetail, GestureConfig, PoseConfig, CustomGestureMetadata, GestureCategoryIconType } from '#shared/index.js';

async function getDetailsHtml(
    entry: GestureConfig | PoseConfig,
    pluginUIServiceRef: PluginUIService
): Promise<string> {
    const actionConfig = entry.actionConfig;
    const pluginId = actionConfig?.pluginId;

    if (!pluginId || pluginId === 'none') return "";

    const manifest = pluginUIServiceRef.getPluginManifest(pluginId);
    
    if (manifest && manifest.status === 'enabled') {
        await pluginUIServiceRef.loadPluginFrontendModule(pluginId);
    }
    
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
                const valueClasses = `card-detail-value ${detail.allowWrap ? 'allow-wrap' : 'truncate'}`;
                return `<div class="card-detail-line">${iconHtml}<span class="${valueClasses}">${detail.value}</span></div>`;
            }).join('');
        } catch (renderError) {
            console.warn(`[ConfigListRenderer] Error rendering details for plugin '${pluginId}':`, renderError);
        }
    } else if (actionConfig?.settings && typeof actionConfig.settings === 'object' && Object.keys(actionConfig.settings).length > 0) {
        const pluginIconDetails = getActionIconDetails(manifest);
        return Object.values(actionConfig.settings).slice(0, 2).map((value, index) => {
            const displayValue = (typeof value === 'object' ? JSON.stringify(value) : String(value)) || 'N/A';
            const iconDetails = index === 0 ? pluginIconDetails : getActionIconDetails(null);
            const isMdi = iconDetails.iconType === 'mdi' || iconDetails.iconName.startsWith('mdi-');
            const iconClass = `card-detail-icon ${isMdi ? `mdi ${iconDetails.iconName}` : 'material-icons'}`;
            const iconContent = isMdi ? '' : iconDetails.iconName;
            const iconHtml = `<span class="${iconClass}" title="${Object.keys(actionConfig.settings as Record<string, unknown>)[index]}">${iconContent}</span>`;
            return `<div class="card-detail-line">${iconHtml}<span class="card-detail-value truncate">${displayValue}</span></div>`;
        }).join('');
    }
    return "";
}

export async function renderConfigList(
  listDiv: HTMLElement | null,
  appStore: AppStore,
  pluginUIServiceRef: PluginUIService,
  uiControllerRef: UIController
): Promise<void> {
  if (!listDiv) {
    console.error("[ConfigListRenderer] Critical references are missing.");
    return;
  }
  
  const configs: Array<GestureConfig | PoseConfig> = appStore.getState().gestureConfigs || [];
  const translate = uiControllerRef.translationService.translate;
  
  const getGestureConfigCategory = (config: GestureConfig | PoseConfig, customMetaList: CustomGestureMetadata[]): GestureCategoryIconType => {
      const name = 'pose' in config ? (config as PoseConfig).pose : (config as GestureConfig).gesture;
      return getGestureDisplayInfo(name, customMetaList).category;
  };
  
  const getCardStatus = (config: GestureConfig | PoseConfig, appStoreRef: AppStore, puiServiceRef: PluginUIService, customMetaList: CustomGestureMetadata[]): { isActive: boolean; reason: 'feature_disabled' | 'plugin_missing' | 'plugin_disabled' | null } => {
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
  
  const originalNameBeingEdited = uiControllerRef.getOriginalNameBeingEdited() ?? null;
  const customMetadataList = appStore.getState().customGestureMetadataList || [];
  
  const sortedConfigs = [...configs].sort((a: GestureConfig | PoseConfig, b: GestureConfig | PoseConfig) => {
    const aStatus = getCardStatus(a, appStore, pluginUIServiceRef, customMetadataList);
    const bStatus = getCardStatus(b, appStore, pluginUIServiceRef, customMetadataList);
    if (aStatus.isActive !== bStatus.isActive) return aStatus.isActive ? -1 : 1;
    const nameA = ('pose' in a ? (a as PoseConfig).pose : (a as GestureConfig).gesture).toLowerCase();
    const nameB = ('pose' in b ? b.pose : b.gesture).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  const listFragment = document.createDocumentFragment();
  let activeCount = 0;
  let inactiveCount = 0;
  
  const activeCards: HTMLDivElement[] = [];
  const inactiveCards: HTMLDivElement[] = [];

  const cardGenerationPromises = sortedConfigs.map(async (config) => {
    const cardStatus = getCardStatus(config, appStore, pluginUIServiceRef, customMetadataList);
    const name = 'pose' in config ? (config as PoseConfig).pose : (config as GestureConfig).gesture;
    const { formattedName, category } = getGestureDisplayInfo(name, customMetadataList);
    const gestureDisplayName = category === 'BUILT_IN_HAND' ? translate(formattedName, { defaultValue: formattedName }) : formattedName;
    
    let itemClasses = "config-item";
    if (cardStatus.isActive) itemClasses += " card-item-clickable";
    if (originalNameBeingEdited === name) itemClasses += " is-editing-highlight";
    
    const cardTitle = gestureDisplayName;
    
    const actionButtons: ActionButtonConfig[] = [
      { action: 'edit', title: translate('editTooltip', { item: name }), titleKey: 'editTooltip', titleSubstitutions: { item: name }, iconKey: 'UI_EDIT_NOTE', extraClasses: ['edit-btn'], translate },
      { action: 'delete', title: translate('deleteTooltip', { item: name }), titleKey: 'deleteTooltip', titleSubstitutions: { item: name }, iconKey: 'UI_DELETE_FOREVER', extraClasses: ['btn-icon-danger', 'delete-btn'], translate }
    ];

    const footerConfig: CardFooterConfig = {};
    
    let pillsContent = "";
    if (config.confidence !== undefined) pillsContent += `<span class="confidence-pill">${config.confidence}%</span>`;
    if (config.duration) pillsContent += `<span class="duration-pill">${config.duration}s</span>`;
    if (pillsContent) footerConfig.pillsHtml = pillsContent;

    let actionTypeDisplay = translate('actionTypeNone');
    const pluginId = config.actionConfig?.pluginId;
    if (pluginId && pluginId !== 'none') {
        const manifest = pluginUIServiceRef.getPluginManifest(pluginId);
        actionTypeDisplay = translate(manifest?.nameKey || pluginId, { defaultValue: pluginId.replace('gesture-vision-plugin-', '') });
    }
    footerConfig.mainText = actionTypeDisplay;
    
    if (!cardStatus.isActive) {
      itemClasses += " config-item-disabled";
      const reasonTextKey = cardStatus.reason === 'plugin_disabled' ? 'pluginDisabled' : (cardStatus.reason === 'plugin_missing' ? 'pluginMissing' : "customFeatureDisabled");
      footerConfig.statusText = translate(reasonTextKey);
      footerConfig.statusClass = 'error';
    }

    const cardElement = createCardElement({
      ...getGestureDisplayInfo(name, customMetadataList).iconDetails,
      title: cardTitle, actionButtons, footerConfig,
      itemClasses: itemClasses, datasetAttributes: { gestureName: name || '' }, translate,
    });

    const detailsContainer = cardElement.querySelector('.card-details');
    if(detailsContainer) {
        detailsContainer.innerHTML = await getDetailsHtml(config, pluginUIServiceRef);
    }
    
    if (cardStatus.isActive) {
        activeCards.push(cardElement);
        activeCount++;
    } else {
        inactiveCards.push(cardElement);
        inactiveCount++;
    }
  });

  await Promise.all(cardGenerationPromises);

  listDiv.innerHTML = "";
  if (activeCount === 0 && inactiveCount === 0) {
      listDiv.innerHTML = `<p class="list-placeholder">${translate("noGesturesConfigured")}</p>`;
  } else {
      activeCards.forEach(card => listFragment.appendChild(card));
      if (inactiveCount > 0) {
          const separatorTitle = document.createElement('h3');
          separatorTitle.className = 'inactive-list-title';
          separatorTitle.textContent = translate('inactiveConfigsTitle', { defaultValue: 'Inactive Configurations'});
          listFragment.appendChild(separatorTitle);
      }
      inactiveCards.forEach(card => listFragment.appendChild(card));
      listDiv.appendChild(listFragment);
  }
}