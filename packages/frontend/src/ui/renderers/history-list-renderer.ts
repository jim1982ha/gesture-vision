/* FILE: packages/frontend/src/ui/renderers/history-list-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { getGestureCategoryIconDetails, getGestureDisplayInfo } from '#frontend/ui/helpers/index.js';
import { translate } from '#shared/services/translations.js';
import type { ActionConfig, ActionDisplayDetail } from '#shared/types/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';

async function getDetailsHtml(entry: HistoryEntry, puiRef: PluginUIService | null | undefined): Promise<string> {
    if (entry.success === false) {
        return `<div class="card-detail-line"><span class="card-detail-icon material-icons error-icon">error_outline</span><span class="card-detail-value error-text">${entry.reason || 'Not Received'}</span></div>`;
    }
    
    const settings = (entry.details as ActionConfig | undefined)?.settings;
    if (entry.actionType && entry.actionType !== "none" && settings && puiRef) {
        const renderer = await puiRef.getActionDisplayDetailsRenderer(entry.actionType);
        if (renderer) {
            const context = puiRef.getPluginUIContext(entry.actionType);
            const details: ActionDisplayDetail[] = renderer(settings, context);
            return details.map(d => `<div class="card-detail-line"><span class="card-detail-icon ${d.iconType === 'mdi' ? `mdi ${d.icon}` : 'material-icons'}">${d.iconType === 'mdi' ? '' : d.icon}</span><span class="card-detail-value ${d.allowWrap ? 'allow-wrap' : ''}">${d.value}</span></div>`).join('');
        }
    }
    return "";
}

function getStatusInfo(entry: HistoryEntry, puiRef: PluginUIService | null | undefined): { statusIconName: string; statusClass: string; title: string; } {
    const actionId = entry.actionType || "none";
    const actionDisplay = translate(puiRef?.getPluginManifest(actionId)?.nameKey || 'actionTypeNone', { defaultValue: actionId });
    if (actionId === "none") return { statusIconName: "info_outline", statusClass: "info", title: "No action configured" };
    if (entry.success) return { statusIconName: "check_circle", statusClass: "success", title: `Action Executed (${actionDisplay})` };
    if (entry.success === false) return { statusIconName: "cancel", statusClass: "error", title: `Action Failed (${actionDisplay}): ${entry.reason || "Unknown"}` };
    return { statusIconName: "hourglass_empty", statusClass: "pending", title: `Action pending (${actionDisplay})...` };
}

function createFooter(icon: string, status: string, action: string, time: string, puiRef: PluginUIService | null | undefined): string {
    const statusIcon = `<span class="card-detail-icon material-icons history-status-icon ${status}">${icon}</span>`;
    const actionDisplay = action !== "none" ? `<span>${translate(puiRef?.getPluginManifest(action)?.nameKey || 'actionTypeNone', { defaultValue: action })}</span><span class="card-footer-separator">|</span>` : '';
    return `<div class="card-footer">${statusIcon}${actionDisplay}<span>${time}</span></div>`;
}

export async function renderHistoryList(
    container: HTMLElement,
    historyItems: HistoryEntry[] | undefined,
    pluginUIServiceRef: PluginUIService | null | undefined,
    appStore: AppStore | null | undefined
): Promise<void> {
    if (!container || !appStore) return;

    const itemsToRender = historyItems ?? appStore.getState().historyEntries;
    
    container.innerHTML = "";
    const listFragment = document.createDocumentFragment();

    if (itemsToRender.length === 0) {
        const placeholder = document.createElement('p');
        placeholder.className = 'list-placeholder';
        placeholder.textContent = translate('noGesturesRecorded');
        listFragment.appendChild(placeholder);
    } else {
        for (const entry of itemsToRender) {
            const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const { statusIconName, statusClass, title } = getStatusInfo(entry, pluginUIServiceRef);
            const detailsHtml = await getDetailsHtml(entry, pluginUIServiceRef);
            const { formattedName } = getGestureDisplayInfo(entry.gesture, appStore.getState().customGestureMetadataList || []);
            
            const card = createCardElement({
                ...getGestureCategoryIconDetails(entry.gestureCategory),
                title: translate(formattedName, { defaultValue: formattedName }),
                detailsHtml,
                footerHtml: createFooter(statusIconName, statusClass, entry.actionType, time, pluginUIServiceRef),
                itemClasses: `history-item status-${statusClass}`,
                titleAttribute: title,
            });
            listFragment.appendChild(card);
        }
    }
    
    container.appendChild(listFragment);
}