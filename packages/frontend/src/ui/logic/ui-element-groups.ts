/* FILE: packages/frontend/src/ui/logic/ui-element-groups.ts */
import type { AllDOMElements } from "#frontend/core/dom-elements.js";
import type { LanguageManagerElements } from "#frontend/services/language-manager.js";
import type { NotificationManagerElements } from "#frontend/services/notification-manager.js";
import type { GlobalSettingsFormElementGroups } from "#frontend/ui/modals/global-settings-modal-manager.js";
import type { HeaderToggleElements } from "#frontend/ui/ui-header-toggles-controller.js";
import type { RendererElements } from "#frontend/ui/ui-renderer-core.js";
import type { LayoutManagerElements } from "#frontend/ui/managers/layout-manager.js";
import type { ModalManagerElements } from "#frontend/ui/managers/modal-manager.js";
import type { SidebarManagerElements } from "#frontend/ui/managers/sidebar-manager.js";
import type { PluginsTabElements } from "../tabs/plugins-tab.js";

type PanelElements = LayoutManagerElements & ModalManagerElements & SidebarManagerElements;

export interface UIManagerElementGroups {
    rendererElements: Partial<RendererElements>;
    panelElements: Partial<PanelElements>;
    notificationManagerElements: Partial<NotificationManagerElements>;
    languageManagerElements: LanguageManagerElements;
    globalSettingsForm: GlobalSettingsFormElementGroups;
    headerToggles: Partial<HeaderToggleElements>;
}

export function getElementGroupingGetters(allElements: Partial<AllDOMElements>): UIManagerElementGroups {
    return {
      rendererElements: {
        outputCanvas: allElements.outputCanvas as HTMLCanvasElement | null,
        videoElement: allElements.videoElement as HTMLVideoElement | null,
        configListDiv: allElements.configListDiv as HTMLElement | null,
        inactiveConfigListDiv: allElements.inactiveConfigListDiv as HTMLElement | null,
        gestureHistoryDiv: allElements.gestureHistoryDiv as HTMLElement | null,
        cameraList: allElements.cameraList as HTMLElement | null,
        cameraListPlaceholder: allElements.cameraListPlaceholder as HTMLElement | null,
        themeList: allElements.themeList as HTMLElement | null,
        cameraSelectButtonMobile: allElements.cameraSelectButtonMobile as HTMLButtonElement | null,
        gestureProgressCircle:
          allElements.gestureProgressCircle as SVGCircleElement | null,
        cooldownProgressCircle:
          allElements.cooldownProgressCircle as SVGCircleElement | null,
        currentGestureSpan: allElements.currentGestureSpan as HTMLElement | null,
        currentConfidenceSpan: allElements.currentConfidenceSpan as HTMLElement | null,
        confidenceBar: allElements.confidenceBar as HTMLElement | null,
        holdTimeDisplay: allElements.holdTimeDisplay as HTMLElement | null,
        holdTimeMetric: allElements.holdTimeMetric as HTMLElement | null,
        progressTimersContainer: allElements.progressTimersContainer as HTMLElement | null,
        topCenterStatus: allElements.topCenterStatus as HTMLElement | null,
        gestureAlertDiv: allElements.gestureAlertDiv as HTMLElement | null,
        gestureAlertTextSpan: allElements.gestureAlertTextSpan as HTMLElement | null,
        gestureSettingsTitle: allElements.gestureSettingsTitle as HTMLElement | null,
        historyTitle: allElements.historyTitle as HTMLElement | null,
        cameraModalTitleText: allElements.cameraModalTitleText as HTMLElement | null,
        settingsModalTitle: allElements.settingsModalTitle as HTMLElement | null,
        rtspSourceListContainer: allElements.rtspSourceListContainer as HTMLElement | null,
        rtspListPlaceholder: allElements.rtspListPlaceholder as HTMLElement | null,
      },
      panelElements: {
        mainSettingsModal: allElements.mainSettingsModal as HTMLElement | null,
        cameraSelectModal: allElements.cameraSelectModal as HTMLElement | null,
        configSidebar: allElements.configSidebar as HTMLElement | null,
        historySidebar: allElements.historySidebar as HTMLElement | null,
        configSidebarIcon: allElements.configSidebarIcon as HTMLElement | null,
        historySidebarIcon: allElements.historySidebarIcon as HTMLElement | null,
        sidebarBackdrop: allElements.sidebarBackdrop as HTMLElement | null,
        mainSettingsToggle: allElements.mainSettingsToggle as HTMLButtonElement | null,
        gestureConfigToggleMobile: allElements.gestureConfigToggleMobile as HTMLButtonElement | null,
        historyToggleMobile: allElements.historyToggleMobile as HTMLButtonElement | null,
        docsModal: allElements.docsModal as HTMLElement | null,
        docsCloseButton: allElements.docsCloseButton as HTMLButtonElement | null,
        cameraSelectCloseButton: allElements.cameraSelectCloseButton as HTMLButtonElement | null,
        configSidebarToggleBtn: allElements.configSidebarToggleBtn as HTMLButtonElement | null,
        historySidebarToggleBtn: allElements.historySidebarToggleBtn as HTMLButtonElement | null,
        configSidebarHeaderCloseBtn: allElements.configSidebarHeaderCloseBtn as HTMLButtonElement | null,
        historySidebarHeaderCloseBtn: allElements.historySidebarHeaderCloseBtn as HTMLButtonElement | null,
        toggleVideoButton: allElements.toggleVideoButton as HTMLElement | null,
        toggleConfigListButton: allElements.toggleConfigListButton as HTMLElement | null,
        videoContainer: allElements.videoContainer as HTMLElement | null,
        configListContainer: allElements.configListContainer as HTMLElement | null,
        videoSizeToggleButton: allElements.videoSizeToggleButton as HTMLElement | null,
        clearHistoryButton: allElements.clearHistoryButton as HTMLButtonElement | null,
      },
      notificationManagerElements: {
        gestureAlertDiv: allElements.gestureAlertDiv as HTMLElement | null,
        gestureAlertTextSpan: allElements.gestureAlertTextSpan as HTMLElement | null,
      },
      languageManagerElements: {
        languageSelectGroupHeader: allElements.languageSelectGroupHeader as HTMLElement | null,
        mainSettingsToggle: allElements.mainSettingsToggle as HTMLButtonElement | null,
        mobileLanguageContainer: allElements.mobileControlsContainer as HTMLElement | null,
        mobileLanguageDropdownTrigger: undefined,
        mobileLanguageDropdownPanel: undefined,
      },
      globalSettingsForm: {
        core: {
          mainSettingsModal: allElements.mainSettingsModal as HTMLElement | null,
          mainSettingsCloseButton: allElements.mainSettingsCloseButton as HTMLButtonElement | null,
          settingsTabs: allElements.settingsTabs as HTMLElement | null,
          settingsTabContentContainer: allElements.mainSettingsModal?.querySelector<HTMLElement>(".modal-scrollable-content"),
          appVersionDisplaySettings: allElements.appVersionDisplaySettings as HTMLElement | null,
          customGesturesTabButton: allElements.customGesturesTabButton as HTMLButtonElement | null,
          settingsModalTitle: allElements.settingsModalTitle as HTMLElement | null,
          settingsModalIcon: allElements.settingsModalTitle?.querySelector<HTMLElement>(".header-icon") ?? null,
          settingsModalTitleText: allElements.settingsModalTitle?.querySelector<HTMLElement>(".header-title") ?? null,
          appearanceSettingsTabButton: allElements.appearanceSettingsTabButton as HTMLButtonElement | null, 
          modalActionsFooter: allElements.mainSettingsModal?.querySelector<HTMLElement>('.modal-actions') ?? null,
        },
        generalTab: {
          globalCooldownSlider:
            allElements.globalCooldownSlider as HTMLInputElement | null,
          globalCooldownValue: allElements.globalCooldownValue as HTMLElement | null,
          resolutionSelectGroup: allElements.resolutionSelectGroup as HTMLElement | null,
          targetFpsSelectGroup: allElements.targetFpsSelectGroup as HTMLElement | null,
          telemetryToggleGroup: allElements.telemetryToggleGroup as HTMLElement | null,
          globalCooldownLabel: allElements.globalCooldownLabel as HTMLElement | null,
          resolutionPrefLabel: allElements.resolutionPrefLabel as HTMLElement | null,
          targetFpsLabel: allElements.targetFpsLabel as HTMLElement | null,
          telemetryEnabledLabel: allElements.telemetryEnabledLabel as HTMLElement | null,
          targetFpsHelp: allElements.targetFpsHelp as HTMLElement | null,
          telemetryEnabledHelp: allElements.telemetryEnabledHelp as HTMLElement | null,
        },
        pluginsTab: {
            pluginsListContainer: allElements.pluginsListContainer as HTMLElement | null,
            pluginsListPlaceholder: allElements.pluginsListPlaceholder as HTMLElement | null,
            pluginInstallUrl: allElements.pluginInstallUrl as HTMLInputElement | null,
            pluginInstallBtn: allElements.pluginInstallBtn as HTMLButtonElement | null,
        } as PluginsTabElements,
        rtspTab: {
          rtspSourceListContainer: allElements.rtspSourceListContainer as HTMLElement | null,
          rtspListPlaceholder: allElements.rtspListPlaceholder as HTMLElement | null,
          rtspAddNewButton: allElements.rtspAddNewButton as HTMLButtonElement | null,
          rtspAddNewButtonLabel: allElements.rtspAddNewButtonLabel as HTMLElement | null,
          rtspAddEditFormContainer: allElements.rtspAddEditFormContainer as HTMLElement | null,
          rtspFormTitle: allElements.rtspFormTitle as HTMLElement | null,
          rtspEditIndex: allElements.rtspEditIndex as HTMLInputElement | null,
          rtspSourceName: allElements.rtspSourceName as HTMLInputElement | null,
          rtspSourceUrl: allElements.rtspSourceUrl as HTMLInputElement | null,
          rtspNameLabel: allElements.rtspNameLabel as HTMLElement | null,
          rtspUrlLabel: allElements.rtspUrlLabel as HTMLElement | null,
          rtspUrlHelp: allElements.rtspUrlHelp as HTMLElement | null,
          rtspSaveSourceButton: allElements.rtspSaveSourceButton as HTMLButtonElement | null,
          rtspSaveButtonLabel: allElements.rtspSaveButtonLabel as HTMLElement | null,
          rtspCancelEditButton: allElements.rtspCancelEditButton as HTMLButtonElement | null,
          rtspSourceOnDemand:
            allElements.rtspSourceOnDemand as HTMLInputElement | null,
          rtspSourceOnDemandLabel: allElements.rtspSourceOnDemandLabel as HTMLElement | null,
          rtspRoiSettingsLabel: allElements.rtspRoiSettingsLabel as HTMLElement | null,
          rtspRoiX: allElements.rtspRoiX as HTMLInputElement | null,
          rtspRoiY: allElements.rtspRoiY as HTMLInputElement | null,
          rtspRoiWidth: allElements.rtspRoiWidth as HTMLInputElement | null,
          rtspRoiHeight: allElements.rtspRoiHeight as HTMLInputElement | null,
          rtspRoiXLabel: allElements.rtspRoiXLabel as HTMLElement | null,
          rtspRoiYLabel: allElements.rtspRoiYLabel as HTMLElement | null,
          rtspRoiWidthLabel: allElements.rtspRoiWidthLabel as HTMLElement | null,
          rtspRoiHeightLabel: allElements.rtspRoiHeightLabel as HTMLElement | null,
          rtspRoiHelp: allElements.rtspRoiHelp as HTMLElement | null,
          rtspListActionsContainer: allElements.rtspListActionsContainer as HTMLElement | null,
        },
        themeTab: {
          colorModeToggleGroup: allElements.colorModeToggleGroup as HTMLElement | null,
          themeToggleGroup: allElements.themeToggleGroup as HTMLElement | null,
          themeList: allElements.themeList as HTMLElement | null,
          themeSelectionLabel: allElements.themeSelectionLabel as HTMLElement | null,
          colorModeSelectionLabel: allElements.colorModeSelectionLabel as HTMLElement | null,
        },
        customGesturesTab: {
          customGestureUploadForm:
            allElements.customGestureUploadForm as HTMLFormElement | null,
          customGestureFile: allElements.customGestureFile as HTMLInputElement | null,
          customGestureDesc:
            allElements.customGestureDesc as HTMLTextAreaElement | null,
          uploadCustomGestureBtn: allElements.uploadCustomGestureBtn as HTMLButtonElement | null,
          cancelCustomGestureImportBtn:
            allElements.cancelCustomGestureImportBtn as HTMLButtonElement | null,
          customGestureSecurityWarningIcon:
            allElements.customGestureSecurityWarningIcon as HTMLElement | null,
          customHandGestureListContainer:
            allElements.customHandGestureListContainer as HTMLElement | null,
          customHandGestureListPlaceholder:
            allElements.customHandGestureListPlaceholder as HTMLElement | null,
          customPoseGestureListContainer:
            allElements.customPoseGestureListContainer as HTMLElement | null,
          customPoseGestureListPlaceholder:
            allElements.customPoseGestureListPlaceholder as HTMLElement | null,
          customGestureDescGroup: allElements.customGestureDescGroup as HTMLElement | null,
        },
      },
      headerToggles: {
        builtInHandBtnDesktop: allElements.headerToggleBuiltInHand as HTMLButtonElement | null,
        customHandGesturesBtnDesktop: allElements.headerToggleCustomHandGestures as HTMLButtonElement | null,
        poseProcessingBtnDesktop: allElements.headerTogglePoseDetection as HTMLButtonElement | null,
        handLandmarksBtnDesktop: allElements.headerToggleHandLandmarks as HTMLButtonElement | null,
        numHands1BtnDesktop: allElements.headerToggleNumHands1 as HTMLButtonElement | null,
        numHands2BtnDesktop: allElements.headerToggleNumHands2 as HTMLButtonElement | null,
        poseLandmarksBtnDesktop: allElements.headerTogglePoseLandmarks as HTMLButtonElement | null,
        featuresDropdownPanel: allElements.featuresDropdownPanel as HTMLElement | null,
        handsAndLandmarksDropdownPanel: allElements.handsAndLandmarksDropdownPanel as HTMLElement | null,
        itemToggleBuiltInHand: allElements.itemToggleBuiltInHand as HTMLButtonElement | null,
        itemToggleCustomHandGestures: allElements.itemToggleCustomHandGestures as HTMLButtonElement | null,
        itemTogglePoseProcessing: allElements.itemTogglePoseProcessing as HTMLButtonElement | null,
        itemToggleHandLandmarks: allElements.itemToggleHandLandmarks as HTMLButtonElement | null,
        itemToggleNumHands1: allElements.itemToggleNumHands1 as HTMLButtonElement | null,
        itemToggleNumHands2: allElements.itemToggleNumHands2 as HTMLButtonElement | null,
        mobileTogglePoseLandmarksDirect: allElements.mobileTogglePoseLandmarksDirect as HTMLButtonElement | null,
        languageSelectGroupHeader: allElements.languageSelectGroupHeader as HTMLElement | null,
      }
    };
}