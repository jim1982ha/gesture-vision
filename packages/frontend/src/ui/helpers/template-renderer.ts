/* FILE: packages/frontend/src/ui/helpers/template-renderer.ts */
// A lightweight, declarative template renderer to replace imperative DOM creation.
// Supports placeholder substitution, conditional rendering (data-if), and HTML injection (data-html-key).

/**
 * Creates and returns a DOM element from an HTML template string and a data object.
 * @param {string} template The HTML template string.
 * @param {Record<string, unknown>} data The data object for populating the template.
 * @returns {HTMLElement | null} The populated DOM element, or null on error.
 */
export function createFromTemplate(template: string, data: Record<string, unknown>): HTMLElement | null {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = template.trim();
    const element = tempDiv.firstElementChild as HTMLElement | null;
    if (!element) return null;
  
    processNode(element, data);
    return element;
  }
  
  function processNode(node: Element, context: Record<string, unknown>) {
    // 1. Conditional Rendering: If this fails, the entire branch is removed.
    if (node.hasAttribute('data-if')) {
      const conditionKey = node.getAttribute('data-if')!;
      if (!context[conditionKey]) {
        node.remove();
        return;
      }
      node.removeAttribute('data-if');
    }
  
    // 2. Attribute Substitution for the current node.
    for (const attr of Array.from(node.attributes)) {
      if (attr.value.includes('{')) {
        attr.value = substitute(attr.value, context);
      }
      if (attr.value === '') {
        node.removeAttribute(attr.name);
      }
      if (attr.name.startsWith('?')) {
          const actualAttrName = attr.name.substring(1);
          const key = attr.value;
          if (context[key]) {
              node.setAttribute(actualAttrName, '');
          }
          node.removeAttribute(attr.name);
      }
    }
  
    // 3. HTML Injection: This is a terminal operation for this branch.
    // If we inject HTML, we assume it's final and do not process its children.
    if (node.hasAttribute('data-html-key')) {
      const key = node.getAttribute('data-html-key')!;
      if (context[key] !== undefined && context[key] !== null) {
        node.innerHTML = String(context[key]);
      }
      node.removeAttribute('data-html-key');
      return; // <-- IMPORTANT: Stop processing this branch.
    }
  
    // 4. Child Node Processing (only runs if we didn't inject HTML).
    if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
      for (const childNode of Array.from(node.childNodes)) {
        if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.includes('{')) {
          childNode.textContent = substitute(childNode.textContent || '', context);
        } else if (childNode.nodeType === Node.ELEMENT_NODE) {
          processNode(childNode as Element, context);
        }
      }
    }
  }
  
  function substitute(text: string, data: Record<string, unknown>): string {
    return text.replace(/\{([\w.]+)\}/g, (match, key) => {
      const value = key.split('.').reduce((o: unknown, i: string) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[i] : undefined), data);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }