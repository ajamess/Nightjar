/**
 * Tests for Issue #18 — Share Link Race Condition Fix
 * 
 * Validates the fixes from v1.8.8:
 * 1. getKeyFromUrl() stores share links in sessionStorage before fragment overwrite
 * 2. handleIdentitySelected() calls processPendingShareLink()
 * 3. processPendingShareLink() auto-switches to existing workspaces with UX toast
 * 4. Share link effect detects links stored by getKeyFromUrl via else branch
 * 5. isShareLinkFragment() correctly identifies all share link patterns
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rootDir = path.resolve(__dirname, '..');
const readFile = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');

const appNewSource = readFile('frontend/src/AppNew.jsx');

// ---------------------------------------------------------------------------
// 1. getKeyFromUrl() — stores share links in sessionStorage
// ---------------------------------------------------------------------------
describe('getKeyFromUrl: share link storage before fragment overwrite', () => {
  test('detects share link via isShareLinkFragment and stores in sessionStorage', () => {
    // The function should store pendingShareLink BEFORE returning null
    // Check that sessionStorage.setItem is called with pendingShareLink inside the isShareLinkFragment branch
    expect(appNewSource).toContain("sessionStorage.setItem('pendingShareLink', fullLink)");
    
    // Verify it happens inside the isShareLinkFragment check, not outside
    const shareLinkBranch = appNewSource.match(
      /if\s*\(isShareLinkFragment\(fragment\)\)\s*\{([\s\S]*?)return null;/
    );
    expect(shareLinkBranch).toBeTruthy();
    const branchBody = shareLinkBranch[1];
    expect(branchBody).toContain("sessionStorage.setItem('pendingShareLink'");
  });

  test('stores expiry from share link if present', () => {
    // The function should extract exp: param and store in pendingShareLinkExpiry
    const shareLinkBranch = appNewSource.match(
      /if\s*\(isShareLinkFragment\(fragment\)\)\s*\{([\s\S]*?)return null;/
    );
    expect(shareLinkBranch).toBeTruthy();
    const branchBody = shareLinkBranch[1];
    expect(branchBody).toContain("fragment.match(/exp:(\\d+)/)");
    expect(branchBody).toContain("sessionStorage.setItem('pendingShareLinkExpiry'");
  });

  test('constructs full link with origin + pathname + fragment', () => {
    const shareLinkBranch = appNewSource.match(
      /if\s*\(isShareLinkFragment\(fragment\)\)\s*\{([\s\S]*?)return null;/
    );
    expect(shareLinkBranch).toBeTruthy();
    const branchBody = shareLinkBranch[1];
    // Verify it builds the full URL: origin + pathname + '#' + fragment
    expect(branchBody).toContain("window.location.origin + window.location.pathname + '#' + fragment");
  });

  test('still returns null for share links (does not use as session key)', () => {
    // After storing, the function should return null
    const shareLinkBranch = appNewSource.match(
      /if\s*\(isShareLinkFragment\(fragment\)\)\s*\{[\s\S]*?(return null;)/
    );
    expect(shareLinkBranch).toBeTruthy();
    expect(shareLinkBranch[1]).toBe('return null;');
  });
});

// ---------------------------------------------------------------------------
// 2. handleIdentitySelected — now calls processPendingShareLink
// ---------------------------------------------------------------------------
describe('handleIdentitySelected: processes pending share links', () => {
  test('calls processPendingShareLink after identity selection', () => {
    // Extract handleIdentitySelected function body
    const handlerMatch = appNewSource.match(
      /const handleIdentitySelected\s*=\s*useCallback\(([\s\S]*?)\},\s*\[/
    );
    expect(handlerMatch).toBeTruthy();
    const handlerBody = handlerMatch[1];
    expect(handlerBody).toContain('processPendingShareLink()');
  });

  test('clears DeepLinkGate before processing share link', () => {
    const handlerMatch = appNewSource.match(
      /const handleIdentitySelected\s*=\s*useCallback\(([\s\S]*?)\},\s*\[/
    );
    expect(handlerMatch).toBeTruthy();
    const handlerBody = handlerMatch[1];
    expect(handlerBody).toContain('setShowDeepLinkGate(false)');
    expect(handlerBody).toContain('setPendingDeepLink(null)');
    
    // Verify DeepLinkGate is cleared BEFORE processPendingShareLink
    const gatePos = handlerBody.indexOf('setShowDeepLinkGate(false)');
    const processPos = handlerBody.indexOf('processPendingShareLink()');
    expect(gatePos).toBeLessThan(processPos);
  });

  test('has processPendingShareLink in dependency array', () => {
    const depsMatch = appNewSource.match(
      /const handleIdentitySelected\s*=\s*useCallback\([\s\S]*?\},\s*\[([^\]]*)\]/
    );
    expect(depsMatch).toBeTruthy();
    expect(depsMatch[1]).toContain('processPendingShareLink');
  });

  test('all three identity entry points call processPendingShareLink', () => {
    // handleOnboardingComplete
    const onboardingMatch = appNewSource.match(
      /const handleOnboardingComplete\s*=\s*useCallback\([\s\S]*?processPendingShareLink\(\)/
    );
    expect(onboardingMatch).toBeTruthy();

    // handleLockScreenUnlock
    const lockMatch = appNewSource.match(
      /const handleLockScreenUnlock\s*=\s*useCallback\([\s\S]*?processPendingShareLink\(\)/
    );
    expect(lockMatch).toBeTruthy();

    // handleIdentitySelected (the new fix)
    const identityMatch = appNewSource.match(
      /const handleIdentitySelected\s*=\s*useCallback\([\s\S]*?processPendingShareLink\(\)/
    );
    expect(identityMatch).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. processPendingShareLink — auto-switch for existing workspaces
// ---------------------------------------------------------------------------
describe('processPendingShareLink: auto-switch with UX toast', () => {
  test('parses pending link to extract entityId', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // Should try to parse the link
    expect(funcBody).toContain('parseShareLink');
  });

  test('handles compressed links via parseShareLinkAsync', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    expect(funcBody).toContain('isCompressedLink');
    expect(funcBody).toContain('parseShareLinkAsync');
  });

  test('checks workspaces list for existing workspace by entityId', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    expect(funcBody).toContain('workspaces.find(w => w.id === parsed.entityId)');
  });

  test('calls joinWorkspace for existing workspace to apply permission updates', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // Should call joinWorkspace with parsed link data
    expect(funcBody).toContain('await joinWorkspace(');
    expect(funcBody).toContain('entityId: parsed.entityId');
    expect(funcBody).toContain('permission: parsed.permission');
  });

  test('shows appropriate toasts for permission changes', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // Permission upgraded toast
    expect(funcBody).toContain("permissionChanged === 'upgraded'");
    expect(funcBody).toContain('Permission upgraded to');
    // Already higher toast
    expect(funcBody).toContain("permissionChanged === 'already-higher'");
    expect(funcBody).toContain('already have');
    // Default switch toast
    expect(funcBody).toContain('Switched to');
  });

  test('clears sessionStorage after auto-switch', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // Should clear pendingShareLink and pendingShareLinkExpiry
    expect(funcBody).toContain("sessionStorage.removeItem('pendingShareLink')");
    expect(funcBody).toContain("sessionStorage.removeItem('pendingShareLinkExpiry')");
  });

  test('falls back to join dialog when parse fails', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // Should catch parse errors and fall through to dialog
    expect(funcBody).toContain('Failed to parse pending share link for auto-switch');
    expect(funcBody).toContain("setCreateWorkspaceMode('join')");
    expect(funcBody).toContain('setShowCreateWorkspaceDialog(true)');
  });

  test('falls back to join dialog for new workspaces', () => {
    const funcMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/
    );
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[1];
    // After workspace lookup fails, should open join dialog
    expect(funcBody).toContain('Found pending share link after identity setup, opening join dialog');
  });

  test('has workspaces and joinWorkspace in dependency array', () => {
    const depsMatch = appNewSource.match(
      /const processPendingShareLink\s*=\s*useCallback\([\s\S]*?\},\s*\[([^\]]*)\]/
    );
    expect(depsMatch).toBeTruthy();
    expect(depsMatch[1]).toContain('workspaces');
    expect(depsMatch[1]).toContain('joinWorkspace');
  });
});

// ---------------------------------------------------------------------------
// 4. Share link effect — detects links stored by getKeyFromUrl
// ---------------------------------------------------------------------------
describe('Share link effect: else branch for pre-stored links', () => {
  test('has else branch after isShareLinkFragment check', () => {
    // The share link effect should have an else clause for when fragment is not a share link
    // but sessionStorage has a pending link (stored by getKeyFromUrl)
    expect(appNewSource).toContain('Found fresh pending share link stored by getKeyFromUrl');
  });

  test('calls processPendingShareLinkRef.current for stored links', () => {
    // Should use ref to avoid stale closure
    expect(appNewSource).toContain('processPendingShareLinkRef.current?.()');
  });

  test('checks freshness of stored link', () => {
    // Should only process links that are fresh (not expired)
    const elseBranch = appNewSource.match(
      /Found fresh pending share link stored by getKeyFromUrl[\s\S]*?processPendingShareLinkRef/
    );
    expect(elseBranch).toBeTruthy();
  });

  test('processPendingShareLinkRef is kept in sync', () => {
    expect(appNewSource).toContain('processPendingShareLinkRef.current = processPendingShareLink');
  });

  test('effect deps do not include processPendingShareLink (uses ref instead)', () => {
    // The share link effect should only depend on [showToast], not processPendingShareLink
    // This prevents unnecessary re-runs when workspaces change
    // Find the share link effect closure and check its deps
    const effectMatch = appNewSource.match(
      /\/\/ --- Share Link Handling ---[\s\S]*?useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([^\]]*)\]\)/
    );
    expect(effectMatch).toBeTruthy();
    expect(effectMatch[1]).toContain('showToast');
    expect(effectMatch[1]).not.toContain('processPendingShareLink');
  });
});

// ---------------------------------------------------------------------------
// 5. isShareLinkFragment — pattern matching
// ---------------------------------------------------------------------------
describe('isShareLinkFragment: pattern detection', () => {
  test('function exists and handles known parameters', () => {
    expect(appNewSource).toContain('function isShareLinkFragment(fragment)');
    // Should check for k:, perm:, topic:, sig:, exp:, by:, hpeer:, srv:, addr:
    expect(appNewSource).toMatch(/k\|perm\|topic\|sig\|exp\|by\|hpeer\|srv\|addr/);
  });

  test('rejects fragments shorter than 20 chars', () => {
    expect(appNewSource).toContain('fragment.length < 20');
  });

  test('detects base64-like workspace IDs with ampersand params', () => {
    // Should check for base64-like workspace IDs followed by & params
    expect(appNewSource).toContain('[A-Za-z0-9_-]{20,}');
  });
});

// ---------------------------------------------------------------------------
// 6. Import correctness
// ---------------------------------------------------------------------------
describe('Import additions for Issue #18 fix', () => {
  test('imports parseShareLinkAsync from sharing utils', () => {
    expect(appNewSource).toContain('parseShareLinkAsync');
    expect(appNewSource).toMatch(/import\s*\{[^}]*parseShareLinkAsync[^}]*\}\s*from\s*'\.\/utils\/sharing'/);
  });

  test('imports isCompressedLink from sharing utils', () => {
    expect(appNewSource).toContain('isCompressedLink');
    expect(appNewSource).toMatch(/import\s*\{[^}]*isCompressedLink[^}]*\}\s*from\s*'\.\/utils\/sharing'/);
  });
});
