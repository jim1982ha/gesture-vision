/* FILE: packages/shared/services/security-utils.ts */

export const secureStorage = {
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error: unknown) {
        console.error(
          `[Security Utils] Failed to save to localStorage for key "${key}":`,
          error
        );
      }
    },
  
    get(key: string): unknown | null { // Return unknown to allow type assertion by caller
      try {
        const storedValue = localStorage.getItem(key);
        if (storedValue === null || storedValue === undefined) {
          return null;
        }
        return JSON.parse(storedValue);
      } catch (error: unknown) {
        console.error(
          `[Security Utils] Failed to read or parse from localStorage for key "${key}":`,
          error
        );
        console.warn(
          `[Security Utils] Removing potentially invalid item for key "${key}" from localStorage.`
        );
        this.remove(key); 
        return null;
      }
    },
  
    remove(key: string): void {
      localStorage.removeItem(key);
    },
  };