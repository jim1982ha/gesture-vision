/* FILE: packages/frontend/src/ui/docs/docs-content-loader.ts */
import { type LanguageCode } from '#shared/services/translations.js';

type DocsContent = {
    [lang in LanguageCode]: {
        [key: string]: string;
    };
};

declare global {
    interface Window {
        marked: { parse: (md: string, options?: object) => string };
        DOMPurify: { sanitize: (html: string, config?: object) => string };
    }
}

async function waitForExternalLibrary(
    libraryName: 'marked' | 'DOMPurify',
    timeout = 3000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window[libraryName]) {
        resolve();
        return;
      }
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (window[libraryName]) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for external library: ${libraryName}`));
        }
      }, 100);
    });
  }

export class DocsContentLoader {
    #docsContent: DocsContent | null = null;
    #docsContentPromise: Promise<void> | null = null;
    #diagrams: Record<string, string> = {
        "diagram-placeholder-1": `<svg width="600" height="250" viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowheadProblem" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto" fill="hsl(var(--color-error))"><polygon points="0 0, 10 3.5, 0 7" /></marker><marker id="arrowheadSuccessGV" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto" fill="hsl(var(--color-success))"><polygon points="0 0, 10 3.5, 0 7" /></marker></defs><rect x="20" y="30" width="250" height="180" rx="10" ry="10" style="fill:hsl(var(--color-error) / 0.1); stroke:hsl(var(--color-error)); stroke-width:2;" /><text x="145" y="55" text-anchor="middle" class="svg-text" style="font-size:13px; font-weight:bold; fill:hsl(var(--color-error));">{{diagram1Title}}</text><text x="70" y="100" style="font-size:30px;">😠</text><rect x="120" y="90" width="120" height="30" rx="5" ry="5" style="fill:hsl(var(--color-surface)); stroke:hsl(var(--color-border));" /><text x="180" y="108" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Remotes}}</text><rect x="120" y="130" width="120" height="30" rx="5" ry="5" style="fill:hsl(var(--color-surface)); stroke:hsl(var(--color-border));" /><text x="180" y="148" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Menus}}</text><rect x="120" y="170" width="120" height="30" rx="5" ry="5" style="fill:hsl(var(--color-surface)); stroke:hsl(var(--color-border));" /><text x="180" y="188" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Errors}}</text><path d="M260 95 C 275 100, 285 110, 300 120 M260 145 C 275 140, 285 130, 300 120 M300 120 L320 120" fill="none" style="stroke:hsl(var(--color-error));" stroke-width="2" stroke-dasharray="5,5" marker-end="url(#arrowheadProblem)" /><text x="300" y="160" text-anchor="middle" class="svg-text" style="font-size:9px; font-style:italic; fill:hsl(var(--color-error));">{{diagram1Pain}}</text><rect x="340" y="30" width="250" height="180" rx="10" ry="10" style="fill:hsl(var(--color-success) / 0.1); stroke:hsl(var(--color-success)); stroke-width:2;" /><text x="455" y="55" text-anchor="middle" class="svg-text" style="font-size:13px; font-weight:bold; fill:hsl(var(--color-success));">{{diagram1GVTitle}}</text><text x="380" y="100" style="font-size:30px;">😊</text><text x="420" y="115" style="font-size:30px;">👋</text><line x1="460" y1="115" x2="500" y2="115" style="stroke:hsl(var(--color-success)); stroke-width:2; marker-end:url(#arrowheadSuccessGV);" /><text x="460" y="160" text-anchor="middle" class="svg-text" style="font-size:10px; fill:hsl(var(--color-success));">{{diagram1Effortless}}</text></svg>`,
        "diagram-placeholder-2": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 300" height="300" width="700"><defs><marker fill="hsl(var(--color-text-secondary))" orient="auto" refY="3" refX="7" markerHeight="6" markerWidth="8" id="arrowGenericProduct"><path d="M0,0 L8,3 L0,6 Z"></path></marker></defs><g transform="translate(50, 30)"><rect ry="5" rx="5" class="arch-user" height="50" width="120" y="0" x="0"></rect><text text-anchor="middle" class="arch-text" y="30" x="60">{{diagram2User}}</text><rect ry="5" rx="5" style="fill:hsl(var(--color-secondary) / 0.1); stroke:hsl(var(--color-secondary));" class="arch-component" height="40" width="120" y="70" x="0"></rect><text text-anchor="middle" class="arch-text" y="95" x="60">{{diagram2Camera}}</text></g><rect ry="10" rx="10" style="fill:none; stroke:hsl(var(--color-border)); stroke-width:1; stroke-dasharray: 5,5;" height="294" width="300" y="5" x="200"></rect><text style="font-size: 8px;" class="arch-label" y="15" x="350" text-anchor="middle">{{diagram2Core}}</text><g transform="translate(220, 20)"><rect ry="5" rx="5" style="fill:hsl(var(--color-primary) / 0.1);" class="arch-component" height="105" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2Frontend}}</text><text text-anchor="middle" class="arch-label" y="33" x="130"><tspan dy="0em" x="130">{{diagram2UISettings}}</tspan><tspan dy="1.1em" x="130">(HTML/CSS/TS)</tspan></text><text text-anchor="middle" class="arch-label" y="55" x="130"><tspan dy="0em" x="130">{{diagram2Video}}</tspan><tspan dy="1.1em" x="130">(Webcam/WHEP)</tspan></text><text text-anchor="middle" class="arch-label" y="77" x="130"><tspan dy="0em" x="130">{{diagram2AI}}</tspan><tspan dy="1.1em" x="130">(Web Worker)</tspan></text><text text-anchor="middle" class="arch-label" y="97" x="130">{{diagram2WSClient}}</text></g><g transform="translate(220, 130)"><rect ry="5" rx="5" style="fill:hsl(var(--color-success) / 0.1);" class="arch-component" height="90" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2Backend}}</text><text text-anchor="middle" class="arch-label" y="35" x="130"><tspan dy="0em" x="130">{{diagram2API}} &amp;</tspan><tspan dy="1.1em" x="130">{{diagram2PluginMgr}}</tspan></text><text text-anchor="middle" class="arch-label" y="59" x="130">{{diagram2WSServer}}</text><text text-anchor="middle" class="arch-label" y="77" x="130">{{diagram2Action}}</text></g><g transform="translate(220, 235)"><rect ry="5" rx="5" style="fill:hsl(var(--color-warning) / 0.1);" class="arch-component" height="60" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2MediaMTX}}</text><text text-anchor="middle" class="arch-label" y="33" x="130">{{diagram2RTSP}}</text><text text-anchor="middle" class="arch-label" y="50" x="130">{{diagram2WHEP}}</text></g><g transform="translate(530, 80)"><rect ry="5" rx="5" class="arch-integration" height="150" width="140" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="20" x="70">{{diagram2Plugins}}</text><text text-anchor="middle" class="arch-label" y="45" x="70">{{diagram2HA}}</text><text text-anchor="middle" class="arch-label" y="65" x="70">{{diagram2MQTT}}</text><text text-anchor="middle" class="arch-label" y="85" x="70">{{diagram2Webhook}}</text><text text-anchor="middle" class="arch-label" y="105" x="70">{{diagram2OS}}</text><text text-anchor="middle" class="arch-label" y="130" x="70">{{diagram2External}}</text></g><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M170,65 C170,65 180,65 215,65"></path><text class="arch-label" y="60" x="175">{{diagram2VideoFeed}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M120,140 Q 170,200 215,240"></path> <text class="arch-label" y="200" x="120">{{diagram2RTSPStream}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M220,240 Q 180,180 215,125"></path> <text class="arch-label" y="170" x="170">{{diagram2WHEPVideo}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M480,75 C500,75 510,85 525,90"></path><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M525,100 C510,105 500,115 480,115"></path><text class="arch-label" y="100" x="495">{{diagram2WebSockets}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M350,220 L350,235"></path><text class="arch-label" y="230" x="360">{{diagram2MTXAPI}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M485,180 C500,180 510,165 525,150"></path><text class="arch-label" y="170" x="490">{{diagram2ActionCalls}}</text></svg>`,
        "diagram-placeholder-3": `<svg width="500" height="120" viewBox="0 0 500 120" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--color-text-primary))"/></marker></defs><text x="30" y="65" style="font-size:24px;">🏠</text><text x="90" y="45" class="arch-label" text-anchor="middle">{{diagram3UserGesture}}</text><text x="90" y="65" style="font-size:24px;" text-anchor="middle">👍</text><path d="M110 60 L150 60" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><rect x="180" y="40" width="100" height="40" class="arch-component" rx="5" ry="5" style="fill:hsl(var(--color-primary) / 0.1)"/><text x="230" y="63" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M280 60 L320 60" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><rect x="340" y="40" width="120" height="40" class="arch-integration" rx="5" ry="5" /><text x="400" y="63" class="arch-text" text-anchor="middle">{{diagram3DeviceOn}}</text></svg>`,
        "diagram-placeholder-4": `<svg width="500" height="130" viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--color-text-primary))"/></marker></defs><text x="50" y="70" style="font-size:30px;">🖥️</text><text x="150" y="50" class="arch-label" text-anchor="middle">{{diagram4UserEngages}}</text><text x="150" y="75" style="font-size:24px;" text-anchor="middle">👉</text><path d="M170 65 L210 65" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><rect x="240" y="45" width="100" height="40" class="arch-component" rx="5" ry="5" style="fill:hsl(var(--color-primary) / 0.1)"/><text x="290" y="68" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M340 65 L380 65"" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><text x="400" y="68" class="arch-text">{{diagram4DynamicContent}}</text></svg>`,
        "diagram-placeholder-5": `<svg width="500" height="130" viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--color-text-primary))"/></marker></defs><text x="50" y="70" style="font-size:30px;">🧑‍🔬</text><text x="150" y="50" class="arch-label" text-anchor="middle">{{diagram5HandsBusy}}</text><text x="150" y="75" style="font-size:24px;" text-anchor="middle">🖐️</text><path d="M170 65 L210 65" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><rect x="240" y="45" width="100" height="40" class="arch-component" rx="5" ry="5" style="fill:hsl(var(--color-primary) / 0.1)"/><text x="290" y="68" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M340 65 L380 65" class="svg-arrow arch-arrow" marker-end="url(#arrowhead)" /><text x="400" y="68" class="arch-text">{{diagram5SystemControl}}</text></svg>`,
    };

    constructor() {
        this.#docsContentPromise = this.#loadContentFile();
    }

    async #loadContentFile(): Promise<void> {
        try {
            // FIXED: Removed leading slash for relative resolution
            const response = await fetch('docs/content.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.#docsContent = await response.json();
        } catch (error) {
            console.error("[Docs] Failed to load docs/content.json:", error);
            this.#docsContent = null;
        }
    }

    public getDiagrams(lang: LanguageCode): Record<string, string> {
        const translatedDiagrams: Record<string, string> = {};
        if (!this.#docsContent) return this.#diagrams;
        
        const langContent = this.#docsContent[lang] || this.#docsContent.en;

        for (const placeholderId in this.#diagrams) {
            let svgString = this.#diagrams[placeholderId];
            svgString = svgString.replace(/\{\{([\w.-]+)}}/g, (_match: string, key: string) => {
                return langContent[key] || `[${key}]`;
            });
            translatedDiagrams[placeholderId] = svgString;
        }
        return translatedDiagrams;
    }

    public async fetchAndProcess(docPath: string, getCurrentLanguage: () => LanguageCode): Promise<string> {
        try {
            await Promise.all([ waitForExternalLibrary('marked'), waitForExternalLibrary('DOMPurify') ]);
            
            // FIXED: Ensure path is relative
            const cleanPath = docPath.startsWith('/') ? docPath.substring(1) : docPath;
            
            const response = await fetch(cleanPath);
            if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${cleanPath}`);
            const docText = await response.text();
            
            await this.#docsContentPromise;

            let translatedText = docText;
            if (this.#docsContent) {
                const currentLang = getCurrentLanguage();
                const langContent = this.#docsContent[currentLang] || this.#docsContent.en;
                translatedText = translatedText.replace(/\{\{([\w.-]+)}}/g, (_match: string, key: string) => {
                    return langContent[key] || `[${key}]`;
                });
            } else {
                console.warn("[Docs] docsContent is null. Skipping translation.");
            }

            const rawHtml = window.marked.parse(translatedText, { gfm: true, breaks: true });
            const domPurifyConfig = { USE_PROFILES: { html: true }, ALLOW_DATA_ATTR: false, ADD_ATTR: ['style'] };
            const finalHtml = window.DOMPurify.sanitize(rawHtml, domPurifyConfig);

            return finalHtml;
        } catch (error) {
            console.error(`[Docs] CRITICAL ERROR in fetchAndProcess for ${docPath}:`, error);
            throw error;
        }
    }
}