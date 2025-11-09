/* FILE: packages/frontend/src/components/modals/DocsModal.tsx */
import React, { useContext, useState, useEffect, useRef } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { DocsContentLoader } from '#frontend/ui/docs/docs-content-loader.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';

const contentLoader = new DocsContentLoader();

export const DocsModal = () => {
    const context = useContext(AppContext);
    const { translate, getCurrentLanguage } = context!.services.translationService;
    const { actions } = context!.appStore.getState();
    const docKey = useAppStore(state => state.docsModalKey);

    const [htmlContent, setHtmlContent] = useState('');
    const [toc, setToc] = useState<{ id: string, text: string, level: number }[]>([]);
    const contentRef = useRef<HTMLElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!docKey) {
            setHtmlContent('');
            return;
        };

        const loadDoc = async () => {
            try {
                setHtmlContent(`<p>${translate('loading')}...</p>`);
                const content = await contentLoader.fetchAndProcess(
                    `docs/${docKey}.md`,
                    getCurrentLanguage
                );
                setHtmlContent(content);
            } catch (error) {
                console.error(`[DocsModal] Error loading document '${docKey}.md':`, error);
                setHtmlContent(`<p style="color: red;">${translate('errorLoadingDoc')}</p>`);
            }
        };

        loadDoc();
    }, [docKey, getCurrentLanguage, translate]);

    useEffect(() => {
        if (contentRef.current) {
            const headings = Array.from(contentRef.current.querySelectorAll<HTMLHeadingElement>('h1, h2, h3'));
            const newToc = headings.map((h, i) => {
                const id = h.id || `doc-heading-${i}`;
                h.id = id;
                return { id: h.id, text: h.textContent || '', level: parseInt(h.tagName[1], 10) };
            });
            setToc(newToc);
        }
    }, [htmlContent]);
    
    if (!context) return null;

    const handleTocClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const target = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
        if (target && scrollRef.current) {
            scrollRef.current.scrollTo({ top: (target as HTMLElement).offsetTop - 20, behavior: 'smooth' });
        }
    };

    const docButtons = [
      { key: 'ABOUT', labelKey: 'docsAboutButton', icon: 'UI_INFO' },
      { key: 'GUIDES', labelKey: 'docsGuidesButton', icon: 'help_outline' },
      { key: 'DEVELOPMENT', labelKey: 'docsDevButton', icon: 'code' },
      { key: 'PLUGIN_DEV', labelKey: 'docsPluginDevButton', icon: 'UI_EXTENSION' },
      { key: 'PRODUCTION', labelKey: 'docsProdButton', icon: 'rocket_launch' },
    ];

    return (
        <div id="docsModal" className="modal visible">
            <div id="docs-modal-content" className="modal-content !max-w-6xl">
                <div id="docs-modal-header" className="modal-header">
                    <span ref={el => el && setIcon(el, 'UI_DOCS')} className="material-icons header-icon"></span>
                    <span id="docs-modal-title" className="header-title">{translate('documentationTitle')}</span>
                    <button id="docs-modal-close-button" onClick={() => actions.toggleDocsModal(false)} className="btn btn-icon header-close-btn" title={translate('close')}>
                        <span ref={el => el && setIcon(el, 'UI_CLOSE')}></span>
                    </button>
                </div>

                <nav id="docs-modal-nav-buttons" className="flex-shrink-0 flex flex-nowrap justify-start gap-2 p-2 border-b border-border">
                    {docButtons.map(b => (
                        <button 
                          key={b.key} 
                          id={`docs-nav-button-${b.key}`} 
                          onClick={() => actions.toggleDocsModal(true, b.key)} 
                          className={clsx('btn btn-secondary !p-2 desktop:!px-4', docKey === b.key && 'active')}
                          title={translate(b.labelKey)}
                        >
                            <span ref={el => el && setIcon(el, b.icon)}></span>
                            <span className="hidden desktop:inline">{translate(b.labelKey)}</span>
                        </button>
                    ))}
                </nav>

                <div id="docs-modal-scroll-container" ref={scrollRef} className="modal-scrollable-content !p-0">
                    <div className="flex flex-col p-0 desktop:flex-row desktop:p-6 desktop:gap-6 h-full">
                        <aside id="docs-modal-sidebar" className="hidden desktop:block sticky top-0 z-dropdown bg-surface desktop:border-r desktop:border-border desktop:pr-4 desktop:w-72 desktop:flex-shrink-0 desktop:self-start">
                            <ul id="docs-modal-toc" className="mt-4 space-y-2 overflow-y-auto">
                                {toc.map(item => (
                                    <li key={item.id}>
                                        <a href={`#${item.id}`} id={`toc-link-${item.id}`} onClick={e => handleTocClick(e, item.id)} className={`toc-h${item.level}`}>
                                            {item.text}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </aside>
                        <main id="docs-modal-main-content" ref={contentRef} className="flex-1 min-w-0 px-4 desktop:px-0">
                            <article className="prose dark:prose-invert max-w-none prose-headings:text-text-primary prose-strong:text-text-primary prose-a:text-primary hover:prose-a:text-primary-hover"
                                dangerouslySetInnerHTML={{ __html: htmlContent }} />
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
};