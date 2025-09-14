/* FILE: packages/frontend/src/ui/base-settings-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import {
  updateButtonGroupActiveState,
  renderButtonGroup,
} from '#frontend/ui/helpers/index.js';
import {
  type TranslationConfigItem,
  type MultiTranslationConfigItem,
  updateTranslationsForComponent,
} from '#frontend/ui/ui-translation-updater.js';

import { type GestureCategoryIconType } from '#shared/index.js';
import type { Substitutions, TranslationService } from '#frontend/services/translation.service.js';
import type { UIController } from './ui-controller-core.js';

export type HTMLElementOrNull = HTMLElement | null;
export type HTMLInputElementOrNull = HTMLInputElement | null;
export type HTMLButtonElementOrNull = HTMLButtonElement | null;

export interface TabElements {
  [key: string]:
    | HTMLElementOrNull
    | HTMLInputElementOrNull
    | HTMLButtonElementOrNull
    | undefined;
}

export interface ButtonGroupOption {
  value: string;
  text?: string;
  textKey?: string;
  titleKey?: string;
  iconKey?: GestureCategoryIconType;
}

// Type for the simplified translation configuration passed to the helper.
type TranslationItemConfig = Omit<TranslationConfigItem, 'translationService'> | Omit<MultiTranslationConfigItem, 'translationService'>;

export abstract class BaseSettingsTab<T extends TabElements> {
  protected _elements: T;
  protected _appStore: AppStore;
  protected _isInitialized = false;
  protected _translate: (key: string, substitutions?: Substitutions) => string;
  protected _translationService: TranslationService;

  constructor(appStore: AppStore, uiControllerRef: UIController, elementQueries: { [K in keyof T]: string }) {
    this._appStore = appStore;
    this._elements = this._queryElements(elementQueries);
    this._translationService = uiControllerRef.translationService;
    this._translate = this._translationService.translate;

    this._appStore.subscribe((state, prevState) => {
      // If the specific tab's check returns false, it means it has handled the update internally.
      // We must honor that and stop further processing by returning immediately.
      // If it returns true, it means a full refresh is required, so we proceed to call loadSettings().
      if (!this._doesConfigUpdateAffectThisTab(state, prevState)) {
        return;
      }
      this.loadSettings();
    });
  }
  
  private _queryElements(queries: { [K in keyof T]: string }): T {
      const elements: Partial<T> = {};
      for (const key in queries) {
          const queryResult = document.querySelector(queries[key as keyof T]);
          elements[key as keyof T] = queryResult as T[keyof T];
      }
      return elements as T;
  }

  protected async _additionalInitializationChecks(): Promise<void> {
    return Promise.resolve();
  }

  public async finishInitialization(): Promise<void> {
    if (this._isInitialized) return;
    await this._additionalInitializationChecks();
    this._isInitialized = true;
    this._initializeSpecificEventListeners();
    this.loadSettings();
    this.applyTranslations();
  }

  protected abstract _initializeSpecificEventListeners(): void;
  protected abstract _doesConfigUpdateAffectThisTab(
    newState: FrontendFullState,
    oldState: FrontendFullState
  ): boolean;
  public abstract loadSettings(): void;
  public abstract applyTranslations(): void;

  protected _addEventListenerHelper = <K extends keyof T, E extends Event>(
    elementKey: K,
    eventType: string,
    handler: (event: E, element: T[K]) => void
  ) =>
    this._elements[elementKey]?.addEventListener(eventType, (event) =>
      handler(event as E, this._elements[elementKey])
    );
  
  protected _applyTranslationsHelper = (
    items: Array<TranslationItemConfig>
  ): void => {
    // Automatically inject the translationService instance into each item.
    const itemsWithService = items.map(item => ({
      ...item,
      translationService: this._translationService,
    }));
    updateTranslationsForComponent(itemsWithService);
  };
  
  protected _getElement = <E extends HTMLElement = HTMLElement>(
    key: keyof T
  ): E | null => this._elements[key] as E | null;

  protected _updateButtonGroupState = (
    group: HTMLElement | null | undefined,
    activeValue: string | number | boolean | null | undefined,
    isDisabled = false
  ): void => updateButtonGroupActiveState(group, activeValue, isDisabled);

  protected _renderButtonGroup(
    container: HTMLElement | null | undefined,
    options: Readonly<Array<ButtonGroupOption>>
  ): void {
    renderButtonGroup(container, options, this._translationService);
  }
}