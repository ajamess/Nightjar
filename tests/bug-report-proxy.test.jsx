/**
 * Bug Report Server Proxy & Behavior Logging Tests
 *
 * Tests for:
 * 1. createGitHubIssue server proxy fallback chain
 * 2. Server-side /api/bug-report endpoint (source validation)
 * 3. logBehavior integration in user action handlers
 */

import { createGitHubIssue } from '../frontend/src/components/BugReportModal';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../frontend/src/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('../frontend/src/hooks/useFocusTrap', () => ({
  useFocusTrap: jest.fn(),
}));

jest.mock('../frontend/src/utils/diagnostics', () => ({
  generateDiagnosticReport: jest.fn().mockResolvedValue({}),
  formatDiagnosticReport: jest.fn().mockReturnValue(''),
}));

jest.mock('../frontend/src/utils/logger', () => ({
  getLogs: jest.fn().mockReturnValue([]),
  logBehavior: jest.fn(),
}));

jest.mock('../frontend/src/utils/websocket', () => ({
  getBasePath: jest.fn().mockReturnValue(''),
}));

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 1. createGitHubIssue – server proxy fallback chain
// ═══════════════════════════════════════════════════════════════════════════
describe('createGitHubIssue – server proxy fallback chain', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.VITE_GITHUB_PAT;
  });

  test('uses server proxy when available and returns issue URL', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://github.com/NiyaNagi/Nightjar/issues/42', number: 42 }),
    });

    const url = await createGitHubIssue('Test Bug', 'Bug body text');
    expect(url).toBe('https://github.com/NiyaNagi/Nightjar/issues/42');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/api/bug-report');
  });

  test('falls through to direct API when server returns 503', async () => {
    process.env.VITE_GITHUB_PAT = 'ghp_test_token_123';

    global.fetch = jest.fn()
      // First call: server proxy → 503
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Not configured' }),
      })
      // Second call: direct GitHub API → success
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html_url: 'https://github.com/NiyaNagi/Nightjar/issues/99' }),
      });

    const url = await createGitHubIssue('Test Bug', 'Bug body');
    expect(url).toBe('https://github.com/NiyaNagi/Nightjar/issues/99');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Second call should go to GitHub API
    expect(global.fetch.mock.calls[1][0]).toBe('https://api.github.com/repos/NiyaNagi/Nightjar/issues');
  });

  test('falls through to direct API when server returns 429 (rate limited)', async () => {
    process.env.VITE_GITHUB_PAT = 'ghp_test_token_123';

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many bug reports' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html_url: 'https://github.com/NiyaNagi/Nightjar/issues/100' }),
      });

    const url = await createGitHubIssue('Test Bug', 'Bug body');
    expect(url).toBe('https://github.com/NiyaNagi/Nightjar/issues/100');
  });

  test('throws when both server proxy and direct API fail (no PAT)', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(createGitHubIssue('Test', 'Body')).rejects.toThrow(
      /unavailable.*no server proxy or PAT/i,
    );
  });

  test('throws when server proxy errors and direct API also fails', async () => {
    process.env.VITE_GITHUB_PAT = 'ghp_test_token_123';

    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Bad credentials' }),
      });

    await expect(createGitHubIssue('Test', 'Body')).rejects.toThrow(/GitHub API error 401/);
  });

  test('server proxy sends correct request body', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://github.com/test/1', number: 1 }),
    });

    await createGitHubIssue('My Bug Title', 'Detailed description');

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.title).toBe('My Bug Title');
    expect(body.body).toBe('Detailed description');
    expect(options.headers['Content-Type']).toBe('application/json');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Server-side /api/bug-report endpoint (source code validation)
// ═══════════════════════════════════════════════════════════════════════════
describe('Server bug-report endpoint – source validation', () => {
  const serverSource = fs.readFileSync(
    path.resolve(__dirname, '../server/unified/index.js'),
    'utf-8',
  );

  test('server has POST /api/bug-report endpoint', () => {
    expect(serverSource).toContain("'/api/bug-report'");
    expect(serverSource).toContain('app.post');
  });

  test('server reads GITHUB_PAT or VITE_GITHUB_PAT from environment', () => {
    expect(serverSource).toContain('process.env.GITHUB_PAT');
    expect(serverSource).toContain('process.env.VITE_GITHUB_PAT');
  });

  test('server includes rate limiting for bug reports', () => {
    expect(serverSource).toContain('checkBugReportRateLimit');
    expect(serverSource).toContain('BUG_REPORT_MAX');
    expect(serverSource).toContain('429');
  });

  test('server validates title and body fields', () => {
    expect(serverSource).toContain("'Missing or empty title'");
    expect(serverSource).toContain("'Missing or empty body'");
  });

  test('server limits title and body sizes to prevent abuse', () => {
    expect(serverSource).toContain('title.length > 500');
    expect(serverSource).toContain('body.length > 65000');
  });

  test('server creates GitHub issue with correct repo and labels', () => {
    expect(serverSource).toContain('NiyaNagi/Nightjar/issues');
    expect(serverSource).toContain("labels: ['bug']");
  });

  test('server returns 503 when PAT is not configured', () => {
    expect(serverSource).toContain("'Bug report submission not configured on this server'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. logBehavior integration (source validation)
// ═══════════════════════════════════════════════════════════════════════════
describe('logBehavior integration – source validation', () => {
  test('AppNew.jsx imports logBehavior from logger', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/AppNew.jsx'),
      'utf-8',
    );
    expect(source).toContain("import { logBehavior } from './utils/logger'");
  });

  test('AppNew.jsx has logBehavior calls for key user actions', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/AppNew.jsx'),
      'utf-8',
    );

    const expectedActions = [
      'create_document',
      'open_document',
      'close_document',
      'delete_document',
      'rename_document',
      'move_document',
      'onboarding_complete',
      'lock_screen_unlocked',
      'switch_identity_initiated',
      'identity_selected',
      'kick_member',
      'update_member_permission',
      'copy_invite_link',
      'toggle_fullscreen',
    ];

    for (const action of expectedActions) {
      expect(source).toContain(`logBehavior(`);
      expect(source).toContain(`'${action}'`);
    }
  });

  test('WorkspaceContext.jsx has logBehavior calls for workspace operations', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/contexts/WorkspaceContext.jsx'),
      'utf-8',
    );

    const expectedActions = [
      'create_workspace',
      'update_workspace',
      'delete_workspace',
      'leave_workspace',
      'switch_workspace',
      'join_workspace',
    ];

    for (const action of expectedActions) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("import { logBehavior } from '../utils/logger'");
  });

  test('FolderContext.jsx has logBehavior calls for folder operations', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/contexts/FolderContext.jsx'),
      'utf-8',
    );

    const expectedActions = [
      'create_folder',
      'update_folder',
      'rename_folder',
      'delete_folder',
      'restore_folder',
      'move_document_to_folder',
    ];

    for (const action of expectedActions) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("import { logBehavior } from '../utils/logger'");
  });

  test('WorkspaceSettings.jsx has logBehavior calls for settings/share actions', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/components/WorkspaceSettings.jsx'),
      'utf-8',
    );

    const expectedActions = [
      'save_settings',
      'copy_share_link',
      'delete_workspace_confirmed',
      'leave_workspace_confirmed',
      'owner_leave_with_transfer',
      'kick_member_from_settings',
    ];

    for (const action of expectedActions) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("import { logBehavior } from '../utils/logger'");
  });

  test('HierarchicalSidebar.jsx has logBehavior calls for sidebar actions', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/components/HierarchicalSidebar.jsx'),
      'utf-8',
    );

    const expectedActions = [
      'select_document_sidebar',
      'drag_drop_to_folder',
      'open_create_workspace_dialog',
      'open_join_workspace_dialog',
    ];

    for (const action of expectedActions) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("import { logBehavior } from '../utils/logger'");
  });

  test('BugReportModal.jsx logs bug report submission', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/components/BugReportModal.jsx'),
      'utf-8',
    );
    expect(source).toContain("logBehavior('app', 'submit_bug_report')");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. BugReportModal – server proxy integration in source
// ═══════════════════════════════════════════════════════════════════════════
describe('BugReportModal – createGitHubIssue source validation', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../frontend/src/components/BugReportModal.jsx'),
    'utf-8',
  );

  test('imports getBasePath from websocket utility', () => {
    expect(source).toContain("import { getBasePath } from '../utils/websocket'");
  });

  test('tries server proxy before direct API', () => {
    const proxyIdx = source.indexOf('/api/bug-report');
    const directIdx = source.indexOf('api.github.com');
    expect(proxyIdx).toBeGreaterThan(-1);
    expect(directIdx).toBeGreaterThan(-1);
    // Proxy attempt should come before direct API attempt
    expect(proxyIdx).toBeLessThan(directIdx);
  });

  test('has fallback chain: server → direct API → throw', () => {
    // Server proxy try/catch
    expect(source).toContain('Strategy 1: Use server-side proxy');
    // Direct API fallback
    expect(source).toContain('Strategy 2: Direct GitHub API');
    // Final throw
    expect(source).toContain('Bug report submission unavailable');
  });
});
