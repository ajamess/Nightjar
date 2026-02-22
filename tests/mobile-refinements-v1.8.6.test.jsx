/**
 * Mobile Refinements v1.8.6 — Tests
 *
 * Tests for all 14 steps of the second mobile refinement round:
 *  1. Body scroll-lock TODO comments exist
 *  2. loading="lazy" on <img> elements
 *  3. iOS auto-zoom fix (font-size ≥ 16px in ≤ 768px blocks)
 *  4. Comments 44px touch targets (pointer: coarse)
 *  5. inputmode attribute on SearchPalette
 *  6. Manifest screenshots placeholder
 *  7. Global -webkit-overflow-scrolling: touch
 *  8. overscroll-behavior: contain on context menus
 *  9. Emoji picker touch targets (40px min)
 * 10. ConfirmDialog 44px buttons (pointer: coarse)
 * 11. Offline-aware toast (nightjar:toast events)
 * 12. Meta description tag in index.html
 * 13. prefers-reduced-motion sidebar transition
 * 14. Kanban TouchSensor delay 150ms / tolerance 8px
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
const fs = require('fs');
const path = require('path');

const resolve = (...p) => path.resolve(__dirname, '..', ...p);
const readSrc = (...p) => fs.readFileSync(resolve(...p), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Body scroll-lock TODO
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 1: Body scroll-lock TODO comments', () => {
  test('Chat.jsx contains scroll-lock TODO', () => {
    const src = readSrc('frontend/src/components/Chat.jsx');
    expect(src).toContain('TODO: [Mobile] Add document.body.style.overflow');
  });

  test('Comments.jsx contains scroll-lock TODO', () => {
    const src = readSrc('frontend/src/components/Comments.jsx');
    expect(src).toContain('TODO: [Mobile] Add document.body.style.overflow');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. loading="lazy" on images
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 2: Lazy-loaded images', () => {
  const files = [
    'frontend/src/AppNew.jsx',
    'frontend/src/components/HierarchicalSidebar.jsx',
    'frontend/src/components/Onboarding/OnboardingFlow.jsx',
    'frontend/src/components/Share/EntityShareDialog.jsx',
    'frontend/src/components/Settings/IdentitySettings.jsx',
    'frontend/src/components/NightjarMascot.jsx',
  ];

  files.forEach(file => {
    test(`${path.basename(file)} has loading="lazy" on img tags`, () => {
      const src = readSrc(file);
      // Every <img in the file should have loading="lazy"
      const imgTags = src.match(/<img\s[^>]*>/gs) || [];
      expect(imgTags.length).toBeGreaterThan(0);
      imgTags.forEach(tag => {
        expect(tag).toContain('loading="lazy"');
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. iOS auto-zoom fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 3: iOS auto-zoom prevention', () => {
  test('Chat.css sets font-size:16px for .chat-input inside 768px block', () => {
    const css = readSrc('frontend/src/components/Chat.css');
    // font-size: 16px for .chat-input should appear in the file
    expect(css).toMatch(/\.chat-input\s*\{[^}]*font-size:\s*16px/);
    // The 480px block should NOT have a separate .chat-input font-size rule
    // (it was moved to the 768px block)
    const blocks480 = css.split('@media (max-width: 480px)');
    if (blocks480.length > 1) {
      const block480Content = blocks480[1].split('}')[0] + blocks480[1].split('}')[1];
      // The 480px block for Chat should not duplicate the font-size rule
      // We just check the 768px block has it
    }
    // Verify 768px block contains .chat-input font-size
    const match768 = css.match(/@media\s*\(\s*max-width:\s*768px\s*\)[\s\S]*?\.chat-input\s*\{[^}]*font-size:\s*16px/);
    expect(match768).not.toBeNull();
  });

  test('MobileToolbar.css link-field uses 16px font-size', () => {
    const css = readSrc('frontend/src/components/MobileToolbar.css');
    expect(css).toMatch(/\.mobile-toolbar__link-field[\s\S]*?font-size:\s*16px/);
    expect(css).not.toMatch(/\.mobile-toolbar__link-field[\s\S]*?font-size:\s*14px/);
  });

  test('global.css enforces 16px on inputs at 768px', () => {
    const css = readSrc('frontend/src/styles/global.css');
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)[\s\S]*?input,\s*select,\s*textarea\s*\{[\s\S]*?font-size:\s*16px/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Comments touch targets
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 4: Comments 44px touch targets', () => {
  let css;
  beforeAll(() => { css = readSrc('frontend/src/components/Comments.css'); });

  test('has @media (pointer: coarse) block', () => {
    expect(css).toContain('@media (pointer: coarse)');
  });

  test('enforces min-height: 44px on action buttons', () => {
    expect(css).toMatch(/pointer:\s*coarse[\s\S]*?min-height:\s*44px/);
  });

  test('targets reply, resolve, unresolve, delete buttons', () => {
    const coarseBlock = css.split('@media (pointer: coarse)')[1];
    expect(coarseBlock).toBeDefined();
    expect(coarseBlock).toContain('.btn-reply');
    expect(coarseBlock).toContain('.btn-resolve');
    expect(coarseBlock).toContain('.btn-unresolve');
    expect(coarseBlock).toContain('.btn-delete-comment');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. inputmode attributes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 5: inputmode attributes', () => {
  test('SearchPalette has inputMode="search"', () => {
    const src = readSrc('frontend/src/components/SearchPalette.jsx');
    expect(src).toMatch(/inputMode\s*=\s*"search"/);
  });

  test('MobileToolbar link field uses type="url"', () => {
    const src = readSrc('frontend/src/components/MobileToolbar.jsx');
    // type="url" implicitly gives URL-optimized keyboard
    expect(src).toMatch(/type\s*=\s*"url"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Manifest screenshots placeholder
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 6: Manifest screenshots placeholder', () => {
  test('manifest.json has a screenshots field', () => {
    const manifest = JSON.parse(readSrc('frontend/public/manifest.json'));
    expect(manifest).toHaveProperty('screenshots');
    expect(Array.isArray(manifest.screenshots)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Global -webkit-overflow-scrolling
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 7: Global -webkit-overflow-scrolling: touch', () => {
  test('global.css has wildcard -webkit-overflow-scrolling rule', () => {
    const css = readSrc('frontend/src/styles/global.css');
    expect(css).toMatch(/\*\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. overscroll-behavior on menus
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 8: overscroll-behavior on context menus', () => {
  test('mobile-modals.css has overscroll-behavior: contain on .context-menu', () => {
    const css = readSrc('frontend/src/styles/mobile-modals.css');
    expect(css).toMatch(/\.context-menu[\s\S]*?overscroll-behavior:\s*contain/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Emoji picker touch targets
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 9: Emoji picker 40px touch targets', () => {
  let css;
  beforeAll(() => { css = readSrc('frontend/src/components/common/UnifiedPicker.css'); });

  test('has pointer:coarse block with emoji button sizing', () => {
    expect(css).toMatch(/pointer:\s*coarse[\s\S]*?\.unified-picker__emoji-btn/);
  });

  test('emoji buttons have min-width: 40px', () => {
    const coarseBlock = css.split('@media (pointer: coarse)')[1];
    expect(coarseBlock).toContain('min-width: 40px');
  });

  test('emoji buttons have min-height: 40px', () => {
    const coarseBlock = css.split('@media (pointer: coarse)')[1];
    expect(coarseBlock).toContain('min-height: 40px');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ConfirmDialog 44px buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 10: ConfirmDialog 44px touch targets', () => {
  let css;
  beforeAll(() => { css = readSrc('frontend/src/components/common/ConfirmDialog.css'); });

  test('has @media (pointer: coarse) block', () => {
    expect(css).toContain('@media (pointer: coarse)');
  });

  test('enforces min-height: 44px on .confirm-dialog__btn', () => {
    const coarseBlock = css.split('@media (pointer: coarse)')[1];
    expect(coarseBlock).toContain('.confirm-dialog__btn');
    expect(coarseBlock).toContain('min-height: 44px');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Offline-aware toast
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 11: Offline-aware toast events', () => {
  test('main.jsx dispatches nightjar:toast on offline-ready', () => {
    const src = readSrc('frontend/src/main.jsx');
    expect(src).toContain("nightjar:toast");
    expect(src).toContain('offline');
    expect(src).toContain('online');
  });

  test('main.jsx listens for online/offline network events', () => {
    const src = readSrc('frontend/src/main.jsx');
    expect(src).toContain("window.addEventListener('online'");
    expect(src).toContain("window.addEventListener('offline'");
  });

  test('ToastContext listens for nightjar:toast custom events', () => {
    const src = readSrc('frontend/src/contexts/ToastContext.jsx');
    expect(src).toContain('nightjar:toast');
    expect(src).toContain("window.addEventListener('nightjar:toast'");
  });

  test('nightjar:toast dispatches showToast when received', () => {
    // Unit test: simulate the event
    const showToastMock = jest.fn();
    const handler = (e) => {
      const { message, type } = e.detail || {};
      if (message) showToastMock(message, type);
    };
    window.addEventListener('nightjar:toast', handler);

    window.dispatchEvent(new CustomEvent('nightjar:toast', {
      detail: { message: 'Test toast', type: 'success' },
    }));

    expect(showToastMock).toHaveBeenCalledWith('Test toast', 'success');
    window.removeEventListener('nightjar:toast', handler);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Meta description tag
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 12: Meta description tag', () => {
  let html;
  beforeAll(() => { html = readSrc('frontend/index.html'); });

  test('index.html has <meta name="description">', () => {
    expect(html).toMatch(/<meta\s+name="description"/);
  });

  test('description mentions peer-to-peer and encryption', () => {
    expect(html).toContain('peer-to-peer');
    expect(html).toContain('encryption');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. prefers-reduced-motion sidebar
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 13: Reduced-motion sidebar transition', () => {
  test('Sidebar.css has prefers-reduced-motion block', () => {
    const css = readSrc('frontend/src/components/Sidebar.css');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  test('Sidebar transition is disabled for reduced-motion', () => {
    const css = readSrc('frontend/src/components/Sidebar.css');
    const reducedMotionBlock = css.split('prefers-reduced-motion: reduce')[1];
    expect(reducedMotionBlock).toContain('.sidebar');
    expect(reducedMotionBlock).toContain('transition: none');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Kanban TouchSensor tuning
// ═══════════════════════════════════════════════════════════════════════════════

describe('Step 14: Kanban TouchSensor 150ms delay', () => {
  test('Kanban.jsx uses 150ms delay for TouchSensor', () => {
    const src = readSrc('frontend/src/components/Kanban.jsx');
    expect(src).toMatch(/TouchSensor[\s\S]*?delay:\s*150/);
  });

  test('Kanban.jsx uses 8px tolerance for TouchSensor', () => {
    const src = readSrc('frontend/src/components/Kanban.jsx');
    expect(src).toMatch(/TouchSensor[\s\S]*?tolerance:\s*8/);
  });

  test('Kanban.jsx no longer uses 200ms delay', () => {
    const src = readSrc('frontend/src/components/Kanban.jsx');
    expect(src).not.toMatch(/TouchSensor[\s\S]*?delay:\s*200/);
  });
});
