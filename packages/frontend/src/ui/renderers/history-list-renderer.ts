/* FILE: packages/frontend/src/ui/renderers/history-list-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { getGestureCategoryIconDetails, getGestureDisplayInfo, setIcon } from '#frontend/ui/helpers/index.js';
import { translate } from '#shared/services/translations.js';
import type { ActionConfig, ActionDisplayDetail } from '#shared/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';

async function getDetailsHtml(entry: HistoryEntry, puiRef: PluginUIService | null | undefined): Promise<string> {
    if (entry.success === false) {
        const errorIcon = document.createElement('span');
        setIcon(errorIcon, 'UI_ERROR');
        errorIcon.classList.add('card-detail-icon', 'error-icon');
        return `<div class="card-detail-line">${errorIcon.outerHTML}<span class="card-detail-value error-text">${entry.reason || 'Not Received'}</span></div>`;
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

function getStatusInfo(entry: HistoryEntry): { statusIconKey: string; statusClass: string; title: string; } {
    const actionId = entry.actionType || "none";
    if (actionId === "none") return { statusIconKey: "UI_INFO", statusClass: "info", title: "No action configured" };
    if (entry.success) return { statusIconKey: "UI_CONFIRM", statusClass: "success", title: `Action Executed` };
    if (entry.success === false) return { statusIconKey: "UI_CANCEL", statusClass: "error", title: `Action Failed: ${entry.reason || "Unknown"}` };
    return { statusIconKey: "UI_HOURGLASS", statusClass: "pending", title: `Action pending...` };
}

function createFooter(iconKey: string, status: string, action: string, time: string, puiRef: PluginUIService | null | undefined): string {
    const statusIconEl = document.createElement('span');
    statusIconEl.className = `card-detail-icon`;
    statusIconEl.innerHTML = `<span></span>`;
    setIcon(statusIconEl, iconKey);
    (statusIconEl.firstChild as HTMLElement).classList.add(`history-status-icon`, status);

    const actionDisplay = action !== "none" ? `<span>${translate(puiRef?.getPluginManifest(action)?.nameKey || 'actionTypeNone', { defaultValue: action })}</span><span class="card-footer-separator">|</span>` : '';
    return `<div class="card-footer">${statusIconEl.outerHTML}${actionDisplay}<span>${time}</span></div>`;
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
            const { statusIconKey, statusClass, title } = getStatusInfo(entry);
            const detailsHtml = await getDetailsHtml(entry, pluginUIServiceRef);
            const { formattedName } = getGestureDisplayInfo(entry.gesture, appStore.getState().customGestureMetadataList || []);
            
            const card = createCardElement({
                ...getGestureCategoryIconDetails(entry.gestureCategory),
                title: translate(formattedName, { defaultValue: formattedName }),
                detailsHtml,
                footerHtml: createFooter(statusIconKey, statusClass, entry.actionType, time, pluginUIServiceRef),
                itemClasses: `history-item status-${statusClass}`,
                titleAttribute: title,
            });
            listFragment.appendChild(card);
        }
    }
    
    container.appendChild(listFragment);
}