/* FILE: packages/frontend/src/ui/ui-themes.ts */
import { DEFAULT_THEME_BASE_ID } from "#frontend/constants/app-defaults.js";

interface Theme {
  id: string;
  nameKey: string; // Key for translation
  icon: string; // Material icon name
}

export const AVAILABLE_THEMES: Theme[] = [
  { id: "main", nameKey: "themeMain", icon: "business_center" },
  { id: "ocean", nameKey: "themeOcean", icon: "waves" },
  { id: "forest", nameKey: "themeForest", icon: "forest" },
  { id: "sunset", nameKey: "themeSunset", icon: "wb_twilight" },
];

if (!AVAILABLE_THEMES.some((theme) => theme.id === DEFAULT_THEME_BASE_ID)) {
  console.error(
    `[Themes] Default base theme ID "${DEFAULT_THEME_BASE_ID}" (from app-defaults) not found in AVAILABLE_THEMES. Check ui-themes.ts and app-defaults.ts.`
  );
}
