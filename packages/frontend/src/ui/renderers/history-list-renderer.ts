/* FILE: packages/frontend/src/ui/renderers/history-list-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { createCardElement, type CardFooterConfig } from '#frontend/ui/helpers/card-utils.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { getGestureDisplayInfo, setIcon } from '#frontend/ui/helpers/index.js';
import type { Substitutions } from '#shared/services/translations.js';
import type { ActionConfig, ActionDisplayDetail } from '#shared/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';

type TranslateFn = (key: string, substitutions?: Substitutions) => string;

async function getDetailsHtml(entry: HistoryEntry, puiRef: PluginUIService | null | undefined): Promise<string> {
    if (entry.success === false) {
        const errorIcon = document.createElement('span');
        setIcon(errorIcon, 'UI_ERROR');
        errorIcon.classList.add('card-detail-icon', 'text-error');
        return `<div class="card-detail-line">${errorIcon.outerHTML}<span class="card-detail-value text-error">${entry.reason || 'Not Received'}</span></div>`;
    }
    
    const settings = (entry.details as ActionConfig | undefined)?.settings;
    if (entry.actionType && entry.actionType !== "none" && settings && puiRef) {
        const renderer = puiRef.getActionDisplayDetailsRenderer(entry.actionType);
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

export async function renderHistoryList(
    container: HTMLElement,
    historyItems: HistoryEntry[] | undefined,
    pluginUIServiceRef: PluginUIService | null | undefined,
    appStore: AppStore | null | undefined,
    translate: TranslateFn
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
        const cardPromises = itemsToRender.map(async (entry) => {
            const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const { statusIconKey, statusClass, title } = getStatusInfo(entry);
            const { formattedName } = getGestureDisplayInfo(entry.gesture, appStore.getState().customGestureMetadataList || []);
            
            const actionDisplay = entry.actionType !== "none" 
                ? translate(pluginUIServiceRef?.getPluginManifest(entry.actionType)?.nameKey || 'actionTypeNone', { defaultValue: entry.actionType })
                : '';

            const footerConfig: CardFooterConfig = {
                mainText: actionDisplay ? `${actionDisplay} | ${time}` : time,
                statusIconKey: statusIconKey,
                statusClass: statusClass
            };
            
            const card = createCardElement({
                ...getGestureDisplayInfo(entry.gesture, appStore.getState().customGestureMetadataList).iconDetails,
                title: translate(formattedName, { defaultValue: formattedName }),
                footerConfig: footerConfig,
                itemClasses: `history-item status-${statusClass}`,
                titleAttribute: title,
                translate,
            });

            const detailsContainer = card.querySelector('.card-details');
            if (detailsContainer) {
                detailsContainer.innerHTML = await getDetailsHtml(entry, pluginUIServiceRef);
            }
            return card;
        });

        const cards = await Promise.all(cardPromises);
        // REVERSAL LOGIC: Reverse the array of generated cards before appending.
        cards.reverse().forEach(card => listFragment.appendChild(card));
    }
    
    container.appendChild(listFragment);
}