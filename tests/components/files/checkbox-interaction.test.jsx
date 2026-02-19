/**
 * Checkbox Interaction Tests — FileCard & FolderCard
 *
 * Verifies that clicking the checkbox does NOT also trigger
 * the card-level handleClick (the stopPropagation fix).
 * Also checks that checkboxes are always visible (opacity 0.4).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import FileCard from '../../../frontend/src/components/files/FileCard';
import FolderCard from '../../../frontend/src/components/files/FolderCard';

// --- Shared test data ---

const FILE = {
  id: 'file-1',
  name: 'report.pdf',
  extension: 'pdf',
  typeCategory: 'document',
  sizeBytes: 2048,
  chunkCount: 2,
  uploadedByName: 'Bob',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const FOLDER = {
  id: 'folder-1',
  name: 'Assets',
  parentId: null,
  createdAt: Date.now(),
  icon: '📁',
  color: null,
};

// =============================================================
// FileCard checkbox tests
// =============================================================

describe('FileCard – Checkbox stopPropagation', () => {
  function renderFileCard(overrides = {}) {
    const defaults = {
      file: FILE,
      onSelect: jest.fn(),
      onClick: jest.fn(),
      onContextMenu: jest.fn(),
      chunkAvailability: {},
      userPublicKey: 'pk1',
      isSelected: false,
      viewMode: 'grid',
    };
    const props = { ...defaults, ...overrides };
    render(<FileCard {...props} />);
    return props;
  }

  // --- Grid view ---
  describe('Grid view', () => {
    test('checkbox click calls onSelect exactly once with ctrl:true', () => {
      const props = renderFileCard({ viewMode: 'grid' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // The checkbox onChange fires onSelect(file.id, { ctrl: true, shift: false })
      expect(props.onSelect).toHaveBeenCalledTimes(1);
      expect(props.onSelect).toHaveBeenCalledWith('file-1', { ctrl: true, shift: false });
    });

    test('checkbox click does NOT fire onClick (no double-click leak)', () => {
      const props = renderFileCard({ viewMode: 'grid' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onClick).not.toHaveBeenCalled();
    });

    test('card click still works for normal selection', () => {
      const props = renderFileCard({ viewMode: 'grid' });
      const card = screen.getByTestId('fs-file-file-1');
      fireEvent.click(card);
      expect(props.onSelect).toHaveBeenCalledWith('file-1', { ctrl: false, shift: false });
    });
  });

  // --- Table view ---
  describe('Table view', () => {
    function renderInTable(overrides = {}) {
      const defaults = {
        file: FILE,
        onSelect: jest.fn(),
        onClick: jest.fn(),
        onContextMenu: jest.fn(),
        chunkAvailability: {},
        userPublicKey: 'pk1',
        isSelected: false,
        viewMode: 'table',
      };
      const props = { ...defaults, ...overrides };
      render(
        <table><tbody><FileCard {...props} /></tbody></table>
      );
      return props;
    }

    test('checkbox click calls onSelect exactly once', () => {
      const props = renderInTable();
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onSelect).toHaveBeenCalledTimes(1);
      expect(props.onSelect).toHaveBeenCalledWith('file-1', { ctrl: true, shift: false });
    });

    test('checkbox click does NOT double-fire via row click', () => {
      const props = renderInTable();
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // Should only have the one ctrl:true call from onChange, not an extra normal-click call
      const calls = props.onSelect.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ ctrl: true, shift: false });
    });
  });

  // --- Compact view ---
  describe('Compact view', () => {
    test('checkbox click calls onSelect exactly once', () => {
      const props = renderFileCard({ viewMode: 'compact' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onSelect).toHaveBeenCalledTimes(1);
      expect(props.onSelect).toHaveBeenCalledWith('file-1', { ctrl: true, shift: false });
    });
  });
});

// =============================================================
// FolderCard checkbox tests
// =============================================================

describe('FolderCard – Checkbox stopPropagation', () => {
  function renderFolderCard(overrides = {}) {
    const defaults = {
      folder: FOLDER,
      onSelect: jest.fn(),
      onClick: jest.fn(),
      onContextMenu: jest.fn(),
      onFileDrop: jest.fn(),
      isSelected: false,
      viewMode: 'grid',
    };
    const props = { ...defaults, ...overrides };
    render(<FolderCard {...props} />);
    return props;
  }

  // --- Grid view ---
  describe('Grid view', () => {
    test('checkbox click calls onSelect exactly once with ctrl:true', () => {
      const props = renderFolderCard({ viewMode: 'grid' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onSelect).toHaveBeenCalledTimes(1);
      expect(props.onSelect).toHaveBeenCalledWith('folder-1', { ctrl: true, shift: false });
    });

    test('checkbox click does NOT fire onClick (no navigation leak)', () => {
      const props = renderFolderCard({ viewMode: 'grid' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // onClick is for folder navigation — checkbox should NOT trigger it
      expect(props.onClick).not.toHaveBeenCalled();
    });

    test('card click still navigates into folder', () => {
      const props = renderFolderCard({ viewMode: 'grid' });
      const card = screen.getByTestId('fs-folder-folder-1');
      fireEvent.click(card);
      expect(props.onClick).toHaveBeenCalledWith(FOLDER);
    });
  });

  // --- Table view ---
  describe('Table view', () => {
    function renderInTable(overrides = {}) {
      const defaults = {
        folder: FOLDER,
        onSelect: jest.fn(),
        onClick: jest.fn(),
        onContextMenu: jest.fn(),
        onFileDrop: jest.fn(),
        isSelected: false,
        viewMode: 'table',
      };
      const props = { ...defaults, ...overrides };
      render(
        <table><tbody><FolderCard {...props} /></tbody></table>
      );
      return props;
    }

    test('checkbox click calls onSelect exactly once', () => {
      const props = renderInTable();
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onSelect).toHaveBeenCalledTimes(1);
      expect(props.onSelect).toHaveBeenCalledWith('folder-1', { ctrl: true, shift: false });
    });

    test('checkbox click does NOT trigger folder navigation', () => {
      const props = renderInTable();
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onClick).not.toHaveBeenCalled();
    });
  });

  // --- Compact view ---
  describe('Compact view', () => {
    test('checkbox click calls onSelect exactly once', () => {
      const props = renderFolderCard({ viewMode: 'compact' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onSelect).toHaveBeenCalledTimes(1);
    });

    test('checkbox click does NOT fire onClick', () => {
      const props = renderFolderCard({ viewMode: 'compact' });
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(props.onClick).not.toHaveBeenCalled();
    });
  });
});

// =============================================================
// Checkbox visibility (opacity) tests
// =============================================================

describe('Checkbox Always Visible (CSS opacity 0.4)', () => {
  test('FileCard grid checkbox has file-card-checkbox class', () => {
    render(
      <FileCard
        file={FILE}
        onSelect={jest.fn()}
        onClick={jest.fn()}
        onContextMenu={jest.fn()}
        chunkAvailability={{}}
        userPublicKey="pk1"
        viewMode="grid"
      />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('file-card-checkbox');
  });

  test('FolderCard grid checkbox has folder-card-checkbox class', () => {
    render(
      <FolderCard
        folder={FOLDER}
        onSelect={jest.fn()}
        onClick={jest.fn()}
        onContextMenu={jest.fn()}
        onFileDrop={jest.fn()}
        viewMode="grid"
      />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('folder-card-checkbox');
  });

  test('FileCard CSS file has opacity 0.4 for checkbox class', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(
      path.join(__dirname, '../../../frontend/src/components/files/FileCard.css'),
      'utf-8'
    );
    // The rule .file-card-checkbox should contain opacity: 0.4
    expect(css).toMatch(/\.file-card-checkbox\s*\{[^}]*opacity:\s*0\.4/s);
  });

  test('FolderCard CSS file has opacity 0.4 for checkbox class', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(
      path.join(__dirname, '../../../frontend/src/components/files/FolderCard.css'),
      'utf-8'
    );
    expect(css).toMatch(/\.folder-card-checkbox\s*\{[^}]*opacity:\s*0\.4/s);
  });
});
