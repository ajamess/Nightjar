import React from 'react';
import { logBehavior } from '../utils/logger';
import './MobileToolbar.css';

/**
 * MobileToolbar — compact bottom formatting bar for touch devices.
 * Shows only the most-used formatting actions in a single scrollable row.
 * Rendered as a fixed-bottom bar inside the editor pane on ≤768px.
 */
const MobileToolbar = ({ editor }) => {
    if (!editor) return null;

    const tools = [
        { label: 'B', ariaLabel: 'Bold', action: () => { logBehavior('document', 'mobile_toolbar_bold'); editor.chain().focus().toggleBold().run(); }, active: editor.isActive('bold'), className: 'bold' },
        { label: 'I', ariaLabel: 'Italic', action: () => { logBehavior('document', 'mobile_toolbar_italic'); editor.chain().focus().toggleItalic().run(); }, active: editor.isActive('italic'), className: 'italic' },
        { label: 'S', ariaLabel: 'Strikethrough', action: () => { logBehavior('document', 'mobile_toolbar_strike'); editor.chain().focus().toggleStrike().run(); }, active: editor.isActive('strike'), className: 'strike' },
        { sep: true },
        { label: 'H1', ariaLabel: 'Heading 1', action: () => { logBehavior('document', 'mobile_toolbar_h1'); editor.chain().focus().toggleHeading({ level: 1 }).run(); }, active: editor.isActive('heading', { level: 1 }) },
        { label: 'H2', ariaLabel: 'Heading 2', action: () => { logBehavior('document', 'mobile_toolbar_h2'); editor.chain().focus().toggleHeading({ level: 2 }).run(); }, active: editor.isActive('heading', { level: 2 }) },
        { label: 'H3', ariaLabel: 'Heading 3', action: () => { logBehavior('document', 'mobile_toolbar_h3'); editor.chain().focus().toggleHeading({ level: 3 }).run(); }, active: editor.isActive('heading', { level: 3 }) },
        { sep: true },
        { label: '•', ariaLabel: 'Bullet List', action: () => { logBehavior('document', 'mobile_toolbar_bullet'); editor.chain().focus().toggleBulletList().run(); }, active: editor.isActive('bulletList') },
        { label: '1.', ariaLabel: 'Numbered List', action: () => { logBehavior('document', 'mobile_toolbar_ordered'); editor.chain().focus().toggleOrderedList().run(); }, active: editor.isActive('orderedList') },
        { sep: true },
        { label: '❝', ariaLabel: 'Blockquote', action: () => { logBehavior('document', 'mobile_toolbar_blockquote'); editor.chain().focus().toggleBlockquote().run(); }, active: editor.isActive('blockquote') },
        { label: '</>', ariaLabel: 'Code', action: () => { logBehavior('document', 'mobile_toolbar_code'); editor.chain().focus().toggleCode().run(); }, active: editor.isActive('code') },
        { sep: true },
        { label: '↶', ariaLabel: 'Undo', action: () => { logBehavior('document', 'mobile_toolbar_undo'); editor.chain().focus().undo().run(); } },
        { label: '↷', ariaLabel: 'Redo', action: () => { logBehavior('document', 'mobile_toolbar_redo'); editor.chain().focus().redo().run(); } },
    ];

    return (
        <div className="mobile-toolbar" role="toolbar" aria-label="Formatting toolbar" data-testid="mobile-toolbar">
            <div className="mobile-toolbar__scroll">
                {tools.map((tool, i) =>
                    tool.sep ? (
                        <div key={`sep-${i}`} className="mobile-toolbar__sep" />
                    ) : (
                        <button
                            key={tool.ariaLabel}
                            type="button"
                            className={`mobile-toolbar__btn ${tool.active ? 'active' : ''} ${tool.className || ''}`}
                            onClick={tool.action}
                            aria-label={tool.ariaLabel}
                            aria-pressed={tool.active || false}
                        >
                            {tool.label}
                        </button>
                    )
                )}
            </div>
        </div>
    );
};

export default React.memo(MobileToolbar);
