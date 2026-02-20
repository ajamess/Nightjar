/**
 * HelpPage - Full-screen in-product documentation overlay
 * 
 * Inspired by Bambu Labs wiki-style documentation.
 * Features:
 * - Left sidebar table of contents
 * - Right content area with step-by-step guides
 * - Deep-linking to specific sections via `initialSection` prop
 * - Full-screen overlay, dismissible with Escape or close button
 * - Content sourced from shared JSON (same data powers the /docs/ wiki)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './HelpPage.css';

// Shared content — imported from the canonical JSON files
// These same files power the public /docs/ wiki
import gettingStarted from '../../../public-site/content/getting-started.json';
import identity from '../../../public-site/content/identity.json';
import workspaces from '../../../public-site/content/workspaces.json';
import documents from '../../../public-site/content/documents.json';
import editor from '../../../public-site/content/editor.json';
import kanban from '../../../public-site/content/kanban.json';
import collaboration from '../../../public-site/content/collaboration.json';
import sharing from '../../../public-site/content/sharing.json';
import chat from '../../../public-site/content/chat.json';
import files from '../../../public-site/content/files.json';
import inventory from '../../../public-site/content/inventory.json';
import search from '../../../public-site/content/search.json';
import shortcuts from '../../../public-site/content/shortcuts.json';
import networking from '../../../public-site/content/networking.json';
import troubleshooting from '../../../public-site/content/troubleshooting.json';

// Help content sections — loaded from shared content JSON
const HELP_SECTIONS = [
  gettingStarted,
  identity,
  workspaces,
  documents,
  editor,
  kanban,
  collaboration,
  sharing,
  chat,
  files,
  inventory,
  search,
  shortcuts,
  networking,
  troubleshooting,
];

// Render a content block (supports screenshot type for wiki/help images)
function ContentBlock({ block }) {
  switch (block.type) {
    case 'heading':
      return <h3 className="help-page__content-heading">{block.text}</h3>;
    case 'paragraph':
      return <p className="help-page__content-paragraph">{block.text}</p>;
    case 'list':
      return (
        <ul className="help-page__content-list">
          {(block.items || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="help-page__content-steps">
          {(block.items || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case 'tip':
      return (
        <div className="help-page__tip">
          <span className="help-page__tip-icon">💡</span>
          <p>{block.text}</p>
        </div>
      );
    case 'shortcuts':
      return (
        <div className="help-page__shortcuts">
          {(block.items || []).map((item, i) => (
            <div key={i} className="help-page__shortcut-row">
              <span className="help-page__shortcut-keys">
                {item.keys.map((key, ki) => (
                  <React.Fragment key={ki}>
                    {ki > 0 && <span className="help-page__shortcut-plus">+</span>}
                    <kbd>{key}</kbd>
                  </React.Fragment>
                ))}
              </span>
              <span className="help-page__shortcut-action">{item.action}</span>
            </div>
          ))}
        </div>
      );
    case 'screenshot':
      // Screenshots are shown in the public docs wiki but gracefully hidden in-app
      // (the Electron app doesn't bundle screenshot images)
      return null;
    default:
      return null;
  }
}

export default function HelpPage({ isOpen, onClose, initialSection }) {
  const [activeSection, setActiveSection] = useState(initialSection || 'getting-started');
  const contentRef = useRef(null);
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  useFocusTrap(modalRef, isOpen, { onEscape: onClose });

  // Update active section when initialSection prop changes
  useEffect(() => {
    if (isOpen && initialSection) {
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  // Scroll content to top when section changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  // Handle Escape key (backup for when useFocusTrap is not available)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose?.();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const currentSection = HELP_SECTIONS.find(s => s.id === activeSection) || HELP_SECTIONS[0];

  return (
    <div
      ref={overlayRef}
      className="help-page-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label="Help & Documentation"
    >
      <div className="help-page-modal" ref={modalRef}>
        {/* Header */}
        <div className="help-page__header">
          <h2 className="help-page__title">📖 Help & Documentation</h2>
          <button
            type="button"
            className="help-page__close"
            onClick={onClose}
            aria-label="Close help"
          >
            ✕
          </button>
        </div>

        <div className="help-page__body">
          {/* Sidebar TOC */}
          <nav className="help-page__toc" aria-label="Table of contents">
            {HELP_SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                className={`help-page__toc-item ${activeSection === section.id ? 'help-page__toc-item--active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="help-page__content" ref={contentRef}>
            <h2 className="help-page__section-title">{currentSection.title}</h2>
            {currentSection.content.map((block, i) => (
              <ContentBlock key={i} block={block} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { HELP_SECTIONS };
