/* FILE: packages/frontend/src/ui/base-settings-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import {
  updateButtonGroupActiveState,
  updateButtonToggleActiveState,
} from '#frontend/ui/helpers/index.js';
import {
  type TranslationConfigItem,
  type MultiTranslationConfigItem,
  updateTranslationsForComponent,
} from '#frontend/ui/ui-translation-updater.js';
import { renderButtonGroup } from '#frontend/ui/helpers/index.js';

import { type GestureCategoryIconType } from '#shared/index.js';

import type { FullConfiguration } from '#shared/index.js';

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

export abstract class BaseSettingsTab<T extends TabElements> {
  protected _elements: T;
  protected _appStore: AppStore;
  protected _isInitialized = false;

  constructor(appStore: AppStore, elementQueries: { [K in keyof T]: string }) {
    this._appStore = appStore;
    this._elements = this._queryElements(elementQueries);

    this._appStore.subscribe((state, prevState) => {
      if (this._doesConfigUpdateAffectThisTab(state, prevState)) {
        this.loadSettings();
      }
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
  public abstract getSettingsToSave(): Partial<FullConfiguration>;

  protected _addEventListenerHelper = <K extends keyof T, E extends Event>(
    elementKey: K,
    eventType: string,
    handler: (event: E, element: T[K]) => void
  ) =>
    this._elements[elementKey]?.addEventListener(eventType, (event) =>
      handler(event as E, this._elements[elementKey])
    );
  protected _applyTranslationsHelper = (
    items: Array<TranslationConfigItem | MultiTranslationConfigItem>
  ): void => updateTranslationsForComponent(items);
  protected _getElement = <E extends HTMLElement = HTMLElement>(
    key: keyof T
  ): E | null => this._elements[key] as E | null;

  protected _updateButtonToggleState = (
    button: HTMLButtonElement | null | undefined,
    isActive: boolean,
    isDisabled = false
  ): void => updateButtonToggleActiveState(button, isActive, isDisabled);
  protected _updateButtonGroupState = (
    group: HTMLElement | null | undefined,
    activeValue: string | number | boolean | null | undefined,
    isDisabled = false
  ): void => updateButtonGroupActiveState(group, activeValue, isDisabled);

  protected _renderButtonGroup(
    container: HTMLElement | null | undefined,
    options: Readonly<Array<ButtonGroupOption>>,
    renderAsHtml = false
  ): void {
    renderButtonGroup(container, options, renderAsHtml);
  }
}