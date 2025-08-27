/* FILE: packages/frontend/src/ui/helpers/ui-dom-helpers.ts */
// General UI utility functions for DOM manipulation, class toggling, and button state management.

/**
 * Toggles a CSS class on an HTML element.
 * @param element The HTML element.
 * @param className The CSS class name to toggle.
 * @param force Optional boolean value to force add or remove the class.
 */
export function toggleElementClass(
  element: HTMLElement | null | undefined,
  className: string,
  force?: boolean
): void {
  if (!element || !className) return;
  element.classList.toggle(className, force);
}

/**
 * Sets the visibility of an HTML element by toggling a 'hidden' class.
 * @param element The HTML element.
 * @param isVisible True to show the element, false to hide.
 * @param displayStyleWhenVisible The display style to apply if the element was hidden via inline style.
 */
export function setElementVisibility(
  element: HTMLElement | null | undefined,
  isVisible: boolean,
  displayStyleWhenVisible = 'block'
): void {
  if (!element) return;
  element.classList.toggle('hidden', !isVisible);
  if (isVisible && element.style.display === 'none') {
    element.style.display = displayStyleWhenVisible;
  }
}

/**
 * Updates the visual and ARIA state of a single toggle button.
 * @param buttonElement - The button to update.
 * @param isActive - Whether the button should be in the active state.
 * @param isDisabled - Whether the button should be disabled.
 */
export function updateButtonToggleActiveState(
  buttonElement: HTMLButtonElement | null | undefined,
  isActive: boolean,
  isDisabled = false
): void {
  if (!buttonElement) return;

  buttonElement.classList.toggle('active', isActive && !isDisabled);
  buttonElement.disabled = isDisabled;

  const role = buttonElement.getAttribute('role');
  if (
    role === 'menuitemradio' ||
    role === 'radio' ||
    role === 'menuitemcheckbox' ||
    role === 'switch'
  ) {
    buttonElement.setAttribute('aria-checked', String(isActive && !isDisabled));
  } else {
    buttonElement.setAttribute('aria-pressed', String(isActive && !isDisabled));
  }
}

/**
 * Updates a group of toggle buttons, ensuring only one (or none) is active.
 * @param groupElement - The parent element containing the buttons.
 * @param activeValue - The data-value of the button that should be active.
 * @param isGroupDisabled - Whether the entire group of buttons should be disabled.
 */
export function updateButtonGroupActiveState(
  groupElement: HTMLElement | null | undefined,
  activeValue: string | number | boolean | null | undefined,
  isGroupDisabled = false
): void {
  if (!groupElement) return;
  const buttons =
    groupElement.querySelectorAll<HTMLButtonElement>('button[data-value]');

  buttons.forEach((btn) => {
    const currentButtonValueStr = btn.dataset.value!;
    let isActive = false;

    if (activeValue !== null && activeValue !== undefined) {
      if (typeof activeValue === 'boolean') {
        isActive = currentButtonValueStr === 'true' === activeValue;
      } else {
        isActive = currentButtonValueStr === String(activeValue);
      }
    }
    updateButtonToggleActiveState(btn, isActive, isGroupDisabled);
  });
}