/* FILE: packages/frontend/src/ui/renderers/camera-list-renderer.ts */
import { translate } from "#shared/services/translations.js"; 
import { normalizeNameForMtx } from "#shared/utils/index.js";
import { type GestureCategoryIconType } from "#shared/constants/index.js";
import { createFromTemplate } from "../utils/template-renderer.js";
import { setIcon } from "#frontend/ui/helpers/icon-helpers.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";

export function updateCameraListUI(
    elements: { cameraList: HTMLElement | null; cameraListPlaceholder: HTMLElement | null },
    deviceMap: Map<string, string>,
    uiControllerRef: UIController | null
): void {
  const { cameraList: listElement, cameraListPlaceholder: placeholderElement } = elements;
  if (!listElement || !placeholderElement || !uiControllerRef?.appStore) { return; }

  listElement.innerHTML = "";
  placeholderElement.style.display = "none";
  const streamStatusMap = uiControllerRef.appStore.getState().streamStatus;

  const createListItem = (id: string, label: string, iconKey: GestureCategoryIconType, status?: string): HTMLLIElement | null => {
    const statusHtml = status ? `<span class="stream-status-indicator ${status}" title="${translate(`streamStatus${status.charAt(0).toUpperCase() + status.slice(1)}`)}"></span>` : '';
    const template = `<li><button class="btn btn-secondary" data-device-id="{id}"><span class="icon-placeholder"></span><span class="label">{label}</span><div data-if="hasStatus" data-html-key="statusIndicatorHTML" style="margin-left:auto;"></div></button></li>`;
    const item = createFromTemplate(template, { id, label, hasStatus: !!statusHtml, statusIndicatorHTML: statusHtml }) as HTMLLIElement | null;
    if (item) setIcon(item.querySelector('.icon-placeholder'), iconKey);
    return item;
  };

  const sortedDevices = [...deviceMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  sortedDevices.forEach(([id, label]) => {
    const isRtsp = id.startsWith("rtsp:");
    const status = isRtsp ? streamStatusMap.get(normalizeNameForMtx(id.substring(5))) || "unknown" : undefined;
    const listItem = createListItem(id, label, isRtsp ? "UI_RTSP_STREAM" : "UI_WEBCAM", status);
    if (listItem) listElement.appendChild(listItem);
  });

  if (sortedDevices.length === 0) {
    placeholderElement.textContent = translate("noCamera");
    placeholderElement.style.display = "block";
    listElement.appendChild(placeholderElement);
  }
}
