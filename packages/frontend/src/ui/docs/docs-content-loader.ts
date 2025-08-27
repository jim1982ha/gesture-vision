/* FILE: packages/frontend/src/ui/docs/docs-content-loader.ts */
import { type LanguageCode } from '#shared/services/translations.js';

type DocsContent = {
    [lang in LanguageCode]: {
        [key: string]: string;
    };
};

// Extend the global Window interface to include properties for external libraries.
declare global {
    interface Window {
        marked: { parse: (md: string, options?: object) => string };
        DOMPurify: { sanitize: (html: string, config?: object) => string };
    }
}

export class DocsContentLoader {
    #docsContent: DocsContent | null = null;
    #docsContentPromise: Promise<void> | null = null;

    #diagrams: Record<string, string> = {
        "diagram-placeholder-1": `<svg width="600" height="250" viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowheadProblem" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto" fill="var(--error, #c00000)"><polygon points="0 0, 10 3.5, 0 7" /></marker><marker id="arrowheadSuccessGV" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto" fill="var(--success-dark, #00796b)"><polygon points="0 0, 10 3.5, 0 7" /></marker></defs><rect x="20" y="30" width="250" height="180" rx="10" ry="10" style="fill:var(--error-light, #fde0e0); stroke:var(--error, #e57373); stroke-width:2;" /><text x="145" y="55" text-anchor="middle" class="svg-text" style="font-size:13px; font-weight:bold; fill:var(--error-darker, #c00000);">{{diagram1Title}}</text><text x="70" y="100" style="font-size:30px;">😠</text><rect x="120" y="90" width="120" height="30" rx="5" ry="5" style="fill:var(--surface, #fff); stroke:var(--border, #ccc);" /><text x="180" y="108" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Remotes}}</text><rect x="120" y="130" width="120" height="30" rx="5" ry="5" style="fill:var(--surface, #fff); stroke:var(--border, #ccc);" /><text x="180" y="148" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Menus}}</text><rect x="120" y="170" width="120" height="30" rx="5" ry="5" style="fill:var(--surface, #fff); stroke:var(--border, #ccc);" /><text x="180" y="188" text-anchor="middle" class="svg-text" style="font-size:10px;">{{diagram1Errors}}</text><path d="M260 95 C 275 100, 285 110, 300 120 M260 145 C 275 140, 285 130, 300 120 M300 120 L320 120" fill="none" style="stroke:var(--error, #c00000);" stroke-width="2" stroke-dasharray="5,5" marker-end="url(#arrowheadProblem)" /><text x="300" y="160" text-anchor="middle" class="svg-text" style="font-size:9px; font-style:italic; fill:var(--error, #c00000);">{{diagram1Pain}}</text><rect x="340" y="30" width="250" height="180" rx="10" ry="10" style="fill:var(--success-light, #e0f2f1); stroke:var(--success, #4db6ac); stroke-width:2;" /><text x="455" y="55" text-anchor="middle" class="svg-text" style="font-size:13px; font-weight:bold; fill:var(--success-dark, #00796b);">{{diagram1GVTitle}}</text><text x="380" y="100" style="font-size:30px;">😊</text><text x="420" y="115" style="font-size:30px;">👋</text><line x1="460" y1="115" x2="500" y2="115" style="stroke:var(--success-dark, #00796b); stroke-width:2; marker-end:url(#arrowheadSuccessGV);" /><text x="460" y="160" text-anchor="middle" class="svg-text" style="font-size:10px; fill:var(--success-darker, #004d40);">{{diagram1Effortless}}</text></svg>`,
        "diagram-placeholder-2": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 300" height="300" width="700"><defs><marker fill="#424242" orient="auto" refY="3" refX="7" markerHeight="6" markerWidth="8" id="arrowGenericProduct"><path d="M0,0 L8,3 L0,6 Z"></path></marker></defs><g transform="translate(50, 30)"><rect ry="5" rx="5" class="arch-user" height="50" width="120" y="0" x="0"></rect><text text-anchor="middle" class="arch-text" y="30" x="60">{{diagram2User}}</text><rect ry="5" rx="5" style="fill:var(--secondary-light, #cfd8dc); stroke:var(--secondary, #78909c);" class="arch-component" height="40" width="120" y="70" x="0"></rect><text text-anchor="middle" class="arch-text" y="95" x="60">{{diagram2Camera}}</text></g><rect ry="10" rx="10" style="fill:none; stroke:var(--secondary, #78909c); stroke-width:1; stroke-dasharray: 5,5;" height="294" width="300" y="5" x="200"></rect><text style="text-anchor:middle; font-size: 7.5px;" class="arch-label" y="15" x="350">{{diagram2Core}}</text><g transform="translate(220, 20)"><rect ry="5" rx="5" style="fill:var(--primary-lighter, #bbdefb);" class="arch-component" height="105" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2Frontend}}</text><text text-anchor="middle" class="arch-label" y="33" x="130"><tspan dy="0em" x="130">{{diagram2UISettings}}</tspan><tspan dy="1.1em" x="130">(HTML/CSS/TS)</tspan></text><text text-anchor="middle" class="arch-label" y="55" x="130"><tspan dy="0em" x="130">{{diagram2Video}}</tspan><tspan dy="1.1em" x="130">(Webcam/WHEP)</tspan></text><text text-anchor="middle" class="arch-label" y="77" x="130"><tspan dy="0em" x="130">{{diagram2AI}}</tspan><tspan dy="1.1em" x="130">(Web Worker)</tspan></text><text text-anchor="middle" class="arch-label" y="97" x="130">{{diagram2WSClient}}</text></g><g transform="translate(220, 130)"><rect ry="5" rx="5" style="fill:var(--success-light, #c8e6c9);" class="arch-component" height="90" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2Backend}}</text><text text-anchor="middle" class="arch-label" y="33" x="130"><tspan dy="0em" x="130">{{diagram2API}}</tspan><tspan dy="1.1em" x="130">{{diagram2PluginMgr}}</tspan></text><text text-anchor="middle" class="arch-label" y="55" x="130">{{diagram2WSServer}}</text><text text-anchor="middle" class="arch-label" y="73" x="130">{{diagram2Action}}</text></g><g transform="translate(220, 235)"><rect ry="5" rx="5" style="fill:var(--warning-light, #fff9c4);" class="arch-component" height="60" width="260" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="15" x="130">{{diagram2MediaMTX}}</text><text text-anchor="middle" class="arch-label" y="33" x="130">{{diagram2RTSP}}</text><text text-anchor="middle" class="arch-label" y="50" x="130">{{diagram2WHEP}}</text></g><g transform="translate(530, 80)"><rect ry="5" rx="5" class="arch-integration" height="150" width="140" y="0" x="0"></rect><text style="font-weight:bold;" text-anchor="middle" class="arch-text" y="20" x="70">{{diagram2Plugins}}</text><text text-anchor="middle" class="arch-label" y="45" x="70">{{diagram2HA}}</text><text text-anchor="middle" class="arch-label" y="65" x="70">{{diagram2MQTT}}</text><text text-anchor="middle" class="arch-label" y="85" x="70">{{diagram2Webhook}}</text><text text-anchor="middle" class="arch-label" y="105" x="70">{{diagram2OS}}</text><text text-anchor="middle" class="arch-label" y="125" x="70">{{diagram2External}}</text></g><path marker-end="url(#arrowGenericProduct)" class="arch-arrow" d="M170,65 C170,65 180,65 215,65"></path><text class="arch-label" y="60" x="175">{{diagram2VideoFeed}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M120,140 Q 170,200 215,240"></path> <text style="font-size:7px;" class="arch-label" y="200" x="120">{{diagram2RTSPStream}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M220,240 Q 180,180 215,125"></path> <text style="font-size:7px;" class="arch-label" y="170" x="170">{{diagram2WHEPVideo}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M480,75 C500,75 510,85 525,90"></path><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M525,100 C510,105 500,115 480,115"></path><text class="arch-label" y="100" x="500">{{diagram2WebSockets}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M350,220 L350,235"></path><text class="arch-label" y="230" x="360">{{diagram2MTXAPI}}</text><path marker-end="url(#arrowGenericProduct)" class="arch-arrow control-flow" d="M485,180 C500,180 510,165 525,150"></path><text class="arch-label" y="170" x="490">{{diagram2ActionCalls}}</text></svg>`,
        "diagram-placeholder-3": `<svg width="500" height="120" viewBox="0 0 500 120" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--text-primary, #333)"/></marker></defs><text x="30" y="65" style="font-size:24px;">🏠</text><text x="90" y="45" class="arch-label" text-anchor="middle">{{diagram3UserGesture}}</text><text x="90" y="65" style="font-size:24px;" text-anchor="middle">👍</text><path d="M110 60 L150 60" class="svg-arrow" marker-end="url(#arrowhead)" /><rect x="180" y="40" width="100" height="40" class="arch-component" rx="5" ry="5" /><text x="230" y="63" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M280 60 L320 60" class="svg-arrow" marker-end="url(#arrowhead)" /><rect x="340" y="40" width="120" height="40" class="arch-integration" rx="5" ry="5" /><text x="400" y="63" class="arch-text" text-anchor="middle">{{diagram3DeviceOn}}</text></svg>`,
        "diagram-placeholder-4": `<svg width="500" height="130" viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--text-primary, #333)"/></marker></defs><text x="50" y="70" style="font-size:30px;">🖥️</text><text x="150" y="50" class="arch-label" text-anchor="middle">{{diagram4UserEngages}}</text><text x="150" y="75" style="font-size:24px;" text-anchor="middle">👉</text><path d="M170 65 L210 65" class="svg-arrow" marker-end="url(#arrowhead)" /><rect x="240" y="45" width="100" height="40" class="arch-component" rx="5" ry="5" /><text x="290" y="68" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M340 65 L380 65"" class="svg-arrow" marker-end="url(#arrowhead)" /><text x="400" y="68" class="arch-text">{{diagram4DynamicContent}}</text></svg>`,
        "diagram-placeholder-5": `<svg width="500" height="130" viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--text-primary, #333)"/></marker></defs><text x="50" y="70" style="font-size:30px;">🧑‍🔬</text><text x="150" y="50" class="arch-label" text-anchor="middle">{{diagram5HandsBusy}}</text><text x="150" y="75" style="font-size:24px;" text-anchor="middle">🖐️</text><path d="M170 65 L210 65" class="svg-arrow" marker-end="url(#arrowhead)" /><rect x="240" y="45" width="100" height="40" class="arch-component" rx="5" ry="5" /><text x="290" y="68" class="arch-text" text-anchor="middle">{{diagram3GV}}</text><path d="M340 65 L380 65" class="svg-arrow" marker-end="url(#arrowhead)" /><text x="400" y="68" class="arch-text">{{diagram5SystemControl}}</text></svg>`,
    };

    constructor() {
        this.#docsContentPromise = this.#loadContentFile();
    }

    async #loadContentFile(): Promise<void> {
        try {
            const response = await fetch('/docs/content.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.#docsContent = await response.json();
        } catch (error) {
            console.error("[DocsContentLoader] Failed to load docs/content.json:", error);
            this.#docsContent = null;
        }
    }

    public async fetchAndProcess(docPath: string, currentLang: LanguageCode): Promise<string> {
        const response = await fetch(docPath);
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${docPath}`);

        const docText = await response.text();
        const rawHtml = window.marked.parse(docText, { gfm: true, breaks: true });
        
        const domPurifyConfig = { USE_PROFILES: { html: true }, ALLOW_DATA_ATTR: false };
        let finalHtml = window.DOMPurify.sanitize(rawHtml, domPurifyConfig);

        await this.#docsContentPromise;
        if (this.#docsContent) {
            const langContent = this.#docsContent[currentLang] || this.#docsContent.en;
            finalHtml = finalHtml.replace(/\{\{([\w.-]+)}}/g, (_match: string, key: string) => {
                return langContent[key] || `[${key}]`;
            });
        }

        // Inject diagrams after translation
        for (const placeholderId in this.#diagrams) {
            let diagramHtml = this.#diagrams[placeholderId];
            if(this.#docsContent) {
                 const langContent = this.#docsContent[currentLang] || this.#docsContent.en;
                 diagramHtml = diagramHtml.replace(/\{\{([\w.-]+)}}/g, (_match: string, key: string) => {
                    return langContent[key] || `[${key}]`;
                });
            }
            const placeholderRegex = new RegExp(`<div id="${placeholderId}"></div>`, 'g');
            finalHtml = finalHtml.replace(placeholderRegex, diagramHtml);
        }

        return finalHtml;
    }
}