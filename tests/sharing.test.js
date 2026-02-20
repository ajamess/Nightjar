/**
 * Test Suite: Sharing Utilities
 * Tests for share link generation and parsing
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { webcrypto } from 'crypto';
import { 
  generateShareLink, 
  parseShareLink, 
  isValidShareLink,
  createNewEntity,
  createNewDocument,
  generateClickableShareLink,
  nightjarLinkToJoinUrl,
  joinUrlToNightjarLink,
  isJoinUrl,
  parseJoinUrl,
  parseAnyShareLink,
  isValidAnyShareLink,
  DEFAULT_SHARE_HOST,
} from '../frontend/src/utils/sharing';

// Setup crypto.subtle for Node.js test environment
beforeAll(() => {
  if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
  }
});

describe('Sharing Utilities', () => {
  // Sample entity IDs (32 hex chars = 16 bytes)
  const sampleWorkspaceId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const sampleFolderId = 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6';
  const sampleDocumentId = 'd1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6';

  describe('generateShareLink', () => {
    test('generates valid workspace share link', () => {
      const link = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'owner',
        hasPassword: true,
        password: 'test-password',
      });

      expect(link).toMatch(/^nightjar:\/\/w\//i);
      expect(link).toContain('perm:o');
      expect(link).toContain('p:test-password');
    });

    test('generates valid folder share link', () => {
      const link = generateShareLink({
        entityType: 'folder',
        entityId: sampleFolderId,
        permission: 'editor',
        hasPassword: true,
        password: 'folder-pass',
      });

      expect(link).toMatch(/^nightjar:\/\/f\//i);
      expect(link).toContain('perm:e');
    });

    test('generates valid document share link', () => {
      const link = generateShareLink({
        entityType: 'document',
        entityId: sampleDocumentId,
        permission: 'viewer',
        hasPassword: true,
        password: 'doc-pass',
      });

      expect(link).toMatch(/^nightjar:\/\/d\//i);
      expect(link).toContain('perm:v');
    });

    test('throws on invalid entity ID length', () => {
      expect(() => generateShareLink({
        entityType: 'workspace',
        entityId: 'too-short',
        permission: 'owner',
      })).toThrow();
    });

    test('supports all permission levels', () => {
      const permissions = ['owner', 'editor', 'viewer'];
      const codes = ['o', 'e', 'v'];

      permissions.forEach((perm, i) => {
        const link = generateShareLink({
          entityType: 'workspace',
          entityId: sampleWorkspaceId,
          permission: perm,
          hasPassword: true,
          password: 'test',
        });
        expect(link).toContain(`perm:${codes[i]}`);
      });
    });
  });

  describe('parseShareLink', () => {
    test('parses workspace link correctly', () => {
      const link = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'owner',
        hasPassword: true,
        password: 'test-pass',
      });

      const parsed = parseShareLink(link);
      
      expect(parsed.entityType).toBe('workspace');
      expect(parsed.entityId).toBe(sampleWorkspaceId);
      expect(parsed.permission).toBe('owner');
      expect(parsed.embeddedPassword).toBe('test-pass');
    });

    test('parses folder link correctly', () => {
      const link = generateShareLink({
        entityType: 'folder',
        entityId: sampleFolderId,
        permission: 'editor',
        hasPassword: true,
        password: 'folder-pass',
      });

      const parsed = parseShareLink(link);
      
      expect(parsed.entityType).toBe('folder');
      expect(parsed.entityId).toBe(sampleFolderId);
      expect(parsed.permission).toBe('editor');
    });

    test('parses document link correctly', () => {
      const link = generateShareLink({
        entityType: 'document',
        entityId: sampleDocumentId,
        permission: 'viewer',
        hasPassword: true,
        password: 'doc-pass',
      });

      const parsed = parseShareLink(link);
      
      expect(parsed.entityType).toBe('document');
      expect(parsed.entityId).toBe(sampleDocumentId);
      expect(parsed.permission).toBe('viewer');
    });

    test('throws on invalid link format', () => {
      expect(() => parseShareLink('invalid')).toThrow();
      expect(() => parseShareLink('nightjar://x/abc')).toThrow();
    });

    test('round-trip: generate then parse returns same data', () => {
      const original = {
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'round-trip-test',
      };

      const link = generateShareLink(original);
      const parsed = parseShareLink(link);

      expect(parsed.entityType).toBe(original.entityType);
      expect(parsed.entityId).toBe(original.entityId);
      expect(parsed.permission).toBe(original.permission);
      expect(parsed.embeddedPassword).toBe(original.password);
    });
  });

  describe('isValidShareLink', () => {
    test('validates correct link formats', () => {
      const validLink = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'owner',
        hasPassword: true,
        password: 'test',
      });

      expect(isValidShareLink(validLink)).toBe(true);
    });

    test('rejects invalid links', () => {
      expect(isValidShareLink('')).toBe(false);
      expect(isValidShareLink('http://example.com')).toBe(false);
      expect(isValidShareLink('nightjar://invalid')).toBe(false);
      expect(isValidShareLink(null)).toBe(false);
      expect(isValidShareLink(undefined)).toBe(false);
    });
  });

  describe('createNewEntity', () => {
    test('creates new workspace with ID and share link', async () => {
      const result = await createNewEntity('workspace', {
        password: 'workspace-pass',
        permission: 'owner',
      });

      expect(result.entityId).toBeDefined();
      expect(result.entityId.length).toBe(32);
      expect(result.shareLink).toMatch(/^nightjar:\/\/w\//i);
    });

    test('creates new folder with ID and share link', async () => {
      const result = await createNewEntity('folder', {
        password: 'folder-pass',
        permission: 'editor',
      });

      expect(result.entityId).toBeDefined();
      expect(result.shareLink).toMatch(/^nightjar:\/\/f\//i);
    });

    test('creates new document with ID and share link', async () => {
      const result = await createNewEntity('document', {
        password: 'doc-pass',
        permission: 'viewer',
      });

      expect(result.entityId).toBeDefined();
      expect(result.shareLink).toMatch(/^nightjar:\/\/d\//i);
    });

    test('generated IDs are unique', async () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        const result = await createNewEntity('workspace', { password: 'test' });
        ids.add(result.entityId);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createNewDocument (legacy)', () => {
    test('creates document with default options', async () => {
      const result = await createNewDocument();
      
      expect(result.documentId).toBeDefined();
      expect(result.shareLink).toBeDefined();
    });

    test('creates document with password', async () => {
      const result = await createNewDocument({ password: 'legacy-pass' });
      
      expect(result.documentId).toBeDefined();
      expect(result.shareLink).toContain('p:legacy-pass');
    });
  });

  // =========================================================================
  // Clickable HTTPS Share Links
  // =========================================================================

  describe('generateClickableShareLink', () => {
    test('generates HTTPS join URL by default', () => {
      const link = generateClickableShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'test-pass',
      });

      expect(link).toMatch(/^https:\/\/relay\.night-jar\.co\/join\/w\//);
      expect(link).toContain('perm:e');
      expect(link).toContain('p:test-pass');
    });

    test('uses custom shareHost', () => {
      const link = generateClickableShareLink({
        entityType: 'document',
        entityId: sampleDocumentId,
        permission: 'viewer',
        hasPassword: true,
        password: 'doc-pass',
        shareHost: 'https://my-relay.example.com',
      });

      expect(link).toMatch(/^https:\/\/my-relay\.example\.com\/join\/d\//);
    });

    test('returns nightjar:// when useLegacyFormat is true', () => {
      const link = generateClickableShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'owner',
        hasPassword: true,
        password: 'legacy',
        useLegacyFormat: true,
      });

      expect(link).toMatch(/^nightjar:\/\/w\//i);
      expect(link).not.toContain('https://');
    });

    test('DEFAULT_SHARE_HOST is set', () => {
      expect(DEFAULT_SHARE_HOST).toBe('https://relay.night-jar.co');
    });
  });

  describe('nightjarLinkToJoinUrl / joinUrlToNightjarLink', () => {
    test('converts nightjar:// to HTTPS join URL', () => {
      const nightjarLink = 'nightjar://w/abc123#p:test&perm:e';
      const joinUrl = nightjarLinkToJoinUrl(nightjarLink);

      expect(joinUrl).toBe('https://relay.night-jar.co/join/w/abc123#p:test&perm:e');
    });

    test('converts HTTPS join URL back to nightjar://', () => {
      const joinUrl = 'https://relay.night-jar.co/join/w/abc123#p:test&perm:e';
      const nightjarLink = joinUrlToNightjarLink(joinUrl);

      expect(nightjarLink).toBe('nightjar://w/abc123#p:test&perm:e');
    });

    test('round-trip: nightjar → join → nightjar preserves link', () => {
      const original = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'round-trip',
      });

      const joinUrl = nightjarLinkToJoinUrl(original);
      const restored = joinUrlToNightjarLink(joinUrl);

      expect(restored).toBe(original);
    });

    test('round-trip: generate clickable → convert back → parse', () => {
      const clickableLink = generateClickableShareLink({
        entityType: 'folder',
        entityId: sampleFolderId,
        permission: 'viewer',
        hasPassword: true,
        password: 'clickable-test',
      });

      // Convert back to nightjar://
      const nightjarLink = joinUrlToNightjarLink(clickableLink);
      const parsed = parseShareLink(nightjarLink);

      expect(parsed.entityType).toBe('folder');
      expect(parsed.entityId).toBe(sampleFolderId);
      expect(parsed.permission).toBe('viewer');
      expect(parsed.embeddedPassword).toBe('clickable-test');
    });

    test('handles custom host with trailing slash', () => {
      const result = nightjarLinkToJoinUrl('nightjar://d/xyz', 'https://example.com/');
      expect(result).toBe('https://example.com/join/d/xyz');
    });

    test('handles join URL with base path', () => {
      const joinUrl = 'https://night-jar.co/app/join/w/abc123#perm:e';
      const nightjarLink = joinUrlToNightjarLink(joinUrl);
      expect(nightjarLink).toBe('nightjar://w/abc123#perm:e');
    });

    test('returns input unchanged for non-matching strings', () => {
      expect(nightjarLinkToJoinUrl('http://example.com')).toBe('http://example.com');
      expect(joinUrlToNightjarLink('nightjar://w/abc')).toBe('nightjar://w/abc');
      expect(nightjarLinkToJoinUrl(null)).toBe(null);
      expect(joinUrlToNightjarLink(null)).toBe(null);
    });
  });

  describe('isJoinUrl', () => {
    test('recognizes valid join URLs', () => {
      expect(isJoinUrl('https://relay.night-jar.co/join/w/abc123')).toBe(true);
      expect(isJoinUrl('https://relay.night-jar.co/join/f/abc123#perm:e')).toBe(true);
      expect(isJoinUrl('https://relay.night-jar.co/join/d/abc123#p:pass&perm:v')).toBe(true);
      expect(isJoinUrl('http://localhost:3000/join/w/abc123')).toBe(true);
    });

    test('rejects non-join URLs', () => {
      expect(isJoinUrl('nightjar://w/abc123')).toBe(false);
      expect(isJoinUrl('https://example.com/other/path')).toBe(false);
      expect(isJoinUrl('')).toBe(false);
      expect(isJoinUrl(null)).toBe(false);
      expect(isJoinUrl(undefined)).toBe(false);
    });
  });

  describe('parseJoinUrl', () => {
    test('parses HTTPS join URL same as nightjar:// link', () => {
      const options = {
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'parse-test',
      };

      // Generate both formats
      const nightjarLink = generateShareLink(options);
      const joinUrl = nightjarLinkToJoinUrl(nightjarLink);

      // Parse both
      const fromNightjar = parseShareLink(nightjarLink);
      const fromJoinUrl = parseJoinUrl(joinUrl);

      // Should produce identical results
      expect(fromJoinUrl.entityType).toBe(fromNightjar.entityType);
      expect(fromJoinUrl.entityId).toBe(fromNightjar.entityId);
      expect(fromJoinUrl.permission).toBe(fromNightjar.permission);
      expect(fromJoinUrl.embeddedPassword).toBe(fromNightjar.embeddedPassword);
    });
  });

  describe('parseAnyShareLink', () => {
    test('parses nightjar:// links', () => {
      const link = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'owner',
        hasPassword: true,
        password: 'any-test',
      });

      const parsed = parseAnyShareLink(link);
      expect(parsed.entityType).toBe('workspace');
      expect(parsed.entityId).toBe(sampleWorkspaceId);
    });

    test('parses HTTPS join URLs', () => {
      const clickable = generateClickableShareLink({
        entityType: 'document',
        entityId: sampleDocumentId,
        permission: 'viewer',
        hasPassword: true,
        password: 'any-test-2',
      });

      const parsed = parseAnyShareLink(clickable);
      expect(parsed.entityType).toBe('document');
      expect(parsed.entityId).toBe(sampleDocumentId);
      expect(parsed.permission).toBe('viewer');
    });

    test('throws on invalid input', () => {
      expect(() => parseAnyShareLink('')).toThrow();
      expect(() => parseAnyShareLink(null)).toThrow();
    });
  });

  describe('isValidAnyShareLink', () => {
    test('validates nightjar:// links', () => {
      const link = generateShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'valid-test',
      });
      expect(isValidAnyShareLink(link)).toBe(true);
    });

    test('validates HTTPS join URLs', () => {
      const clickable = generateClickableShareLink({
        entityType: 'workspace',
        entityId: sampleWorkspaceId,
        permission: 'editor',
        hasPassword: true,
        password: 'valid-test-2',
      });
      expect(isValidAnyShareLink(clickable)).toBe(true);
    });

    test('rejects garbage', () => {
      expect(isValidAnyShareLink('')).toBe(false);
      expect(isValidAnyShareLink('http://google.com')).toBe(false);
      expect(isValidAnyShareLink(null)).toBe(false);
    });
  });
});
