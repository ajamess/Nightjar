/**
 * WorkspaceSwitcher Component Tests
 * 
 * Tests for workspace switching, color inheritance, 
 * empty state, settings access, and delete flow.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// --- Mocks (must precede component import) ---

const mockSwitchWorkspace = jest.fn();
const mockDeleteWorkspace = jest.fn().mockResolvedValue(true);
const mockOnOpenSettings = jest.fn();
const mockOnCreateWorkspace = jest.fn();
const mockOnJoinWorkspace = jest.fn();

let mockWorkspacesData = {
  workspaces: [],
  currentWorkspace: null,
  hasWorkspaces: false,
  switchWorkspace: mockSwitchWorkspace,
  deleteWorkspace: mockDeleteWorkspace,
};

jest.mock('../../frontend/src/contexts/WorkspaceContext', () => ({
  useWorkspaces: () => mockWorkspacesData,
}));

jest.mock('../../frontend/src/contexts/PermissionContext', () => ({
  usePermissions: () => ({
    canCreate: () => true,
    canEdit: () => true,
    canDelete: () => true,
    getPermission: () => 'owner',
  }),
}));

const mockEnsureContrastWithWhite = jest.fn((color, opacity) => {
  if (!color) return 'transparent';
  return `linear-gradient(rgba(0,0,0,${opacity || 0.3}),rgba(0,0,0,${opacity || 0.3})),${color}`;
});

jest.mock('../../frontend/src/utils/colorUtils', () => ({
  ensureContrastWithWhite: (...args) => mockEnsureContrastWithWhite(...args),
}));

import WorkspaceSwitcher from '../../frontend/src/components/WorkspaceSwitcher';

// --- Helpers ---

function resetMocks() {
  mockSwitchWorkspace.mockClear();
  mockDeleteWorkspace.mockClear();
  mockOnOpenSettings.mockClear();
  mockOnCreateWorkspace.mockClear();
  mockOnJoinWorkspace.mockClear();
  mockEnsureContrastWithWhite.mockClear();
}

function renderSwitcher(overrides = {}) {
  return render(
    <WorkspaceSwitcher
      onOpenSettings={mockOnOpenSettings}
      onCreateWorkspace={mockOnCreateWorkspace}
      onJoinWorkspace={mockOnJoinWorkspace}
      {...overrides}
    />
  );
}

// --- Sample data ---

const WORKSPACE_NO_COLOR = {
  id: 'ws-1',
  name: 'Project Alpha',
  icon: '📁',
  color: null,
  myPermission: 'owner',
};

const WORKSPACE_WITH_COLOR = {
  id: 'ws-2',
  name: 'Design Team',
  icon: '🎨',
  color: '#e74c3c',
  myPermission: 'editor',
};

const WORKSPACE_WITH_COLOR_2 = {
  id: 'ws-3',
  name: 'Marketing',
  icon: '📣',
  color: '#3498db',
  myPermission: 'viewer',
};

// =============================================================
// Tests
// =============================================================

describe('WorkspaceSwitcher Component', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ----- Empty state -----
  describe('Empty State (no workspaces)', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [],
        currentWorkspace: null,
        hasWorkspaces: false,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('renders empty state message', () => {
      renderSwitcher();
      expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
    });

    test('shows Create Workspace button', () => {
      renderSwitcher();
      expect(screen.getByTestId('create-workspace-btn')).toBeInTheDocument();
      expect(screen.getByText('Create Workspace')).toBeInTheDocument();
    });

    test('shows Join via Link button', () => {
      renderSwitcher();
      expect(screen.getByTestId('join-workspace-btn')).toBeInTheDocument();
      expect(screen.getByText('Join via Link')).toBeInTheDocument();
    });

    test('Create button fires onCreateWorkspace callback', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('create-workspace-btn'));
      expect(mockOnCreateWorkspace).toHaveBeenCalledTimes(1);
    });

    test('Join button fires onJoinWorkspace callback', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('join-workspace-btn'));
      expect(mockOnJoinWorkspace).toHaveBeenCalledTimes(1);
    });

    test('does NOT render settings gear in empty state', () => {
      renderSwitcher();
      expect(screen.queryByTestId('workspace-settings-btn')).not.toBeInTheDocument();
    });
  });

  // ----- Single workspace without color -----
  describe('Single Workspace (no color)', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_NO_COLOR],
        currentWorkspace: WORKSPACE_NO_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('renders workspace name in trigger', () => {
      renderSwitcher();
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('renders workspace icon', () => {
      renderSwitcher();
      expect(screen.getByText('📁')).toBeInTheDocument();
    });

    test('renders permission badge', () => {
      renderSwitcher();
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });

    test('renders settings gear button', () => {
      renderSwitcher();
      expect(screen.getByTestId('workspace-settings-btn')).toBeInTheDocument();
    });

    test('settings gear fires onOpenSettings with current workspace', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-settings-btn'));
      expect(mockOnOpenSettings).toHaveBeenCalledWith(WORKSPACE_NO_COLOR);
    });

    test('trigger button does NOT have inline color style when no color', () => {
      renderSwitcher();
      const trigger = screen.getByTestId('workspace-selector');
      // No inline color should be set
      expect(trigger.style.color).toBeFalsy();
    });
  });

  // ----- Workspace with color — the CSS fix target -----
  describe('Workspace with Color (text color inheritance)', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_WITH_COLOR, WORKSPACE_WITH_COLOR_2],
        currentWorkspace: WORKSPACE_WITH_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('trigger gets inline color: #ffffff when workspace has color', () => {
      renderSwitcher();
      const trigger = screen.getByTestId('workspace-selector');
      // jsdom normalizes hex to rgb
      expect(trigger.style.color).toBe('rgb(255, 255, 255)');
    });

    test('trigger gets background from ensureContrastWithWhite', () => {
      renderSwitcher();
      // jsdom drops linear-gradient from style, so verify the mock was called correctly
      expect(mockEnsureContrastWithWhite).toHaveBeenCalledWith('#e74c3c', 0.3);
    });

    test('workspace name is rendered (child inherits color via CSS)', () => {
      renderSwitcher();
      // The name text should be present and visible
      expect(screen.getByText('Design Team')).toBeInTheDocument();
    });

    test('workspace icon is rendered', () => {
      renderSwitcher();
      expect(screen.getByText('🎨')).toBeInTheDocument();
    });

    test('chevron is rendered', () => {
      renderSwitcher();
      expect(screen.getByText('▼')).toBeInTheDocument();
    });
  });

  // ----- Dropdown interactions -----
  describe('Dropdown Behavior', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_NO_COLOR, WORKSPACE_WITH_COLOR, WORKSPACE_WITH_COLOR_2],
        currentWorkspace: WORKSPACE_NO_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('dropdown is hidden by default', () => {
      renderSwitcher();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('clicking trigger opens dropdown', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    test('dropdown lists all workspaces', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByTestId('workspace-option-Project-Alpha')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-option-Design-Team')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-option-Marketing')).toBeInTheDocument();
    });

    test('current workspace has active styling and check mark', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      const activeOption = screen.getByTestId('workspace-option-Project-Alpha');
      expect(activeOption).toHaveAttribute('aria-selected', 'true');
      expect(activeOption.textContent).toContain('✓');
    });

    test('colored workspace option gets inline color #ffffff', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      const coloredOption = screen.getByTestId('workspace-option-Design-Team');
      // jsdom normalizes hex to rgb
      expect(coloredOption.style.color).toBe('rgb(255, 255, 255)');
    });

    test('non-colored workspace option does NOT get inline color', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      const plainOption = screen.getByTestId('workspace-option-Project-Alpha');
      expect(plainOption.style.color).toBeFalsy();
    });

    test('clicking workspace option calls switchWorkspace and closes dropdown', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByTestId('workspace-option-Design-Team'));
      expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-2');
      // Dropdown should close
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('Escape key closes dropdown', () => {
      const { container } = renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      // Fire escape on the switcher wrapper
      fireEvent.keyDown(container.querySelector('.workspace-switcher'), { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('dropdown shows Create New Workspace action', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByTestId('dropdown-create-workspace-btn')).toBeInTheDocument();
    });

    test('dropdown shows Join via Link action', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByTestId('dropdown-join-workspace-btn')).toBeInTheDocument();
    });

    test('dropdown create action fires callback and closes', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByTestId('dropdown-create-workspace-btn'));
      expect(mockOnCreateWorkspace).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('dropdown join action fires callback and closes', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByTestId('dropdown-join-workspace-btn'));
      expect(mockOnJoinWorkspace).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ----- Permission badge display -----
  describe('Permission Badges', () => {
    test('shows Owner badge with correct color', () => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_NO_COLOR],
        currentWorkspace: WORKSPACE_NO_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
      renderSwitcher();
      const badge = screen.getByText('Owner');
      expect(badge).toBeInTheDocument();
      expect(badge.style.backgroundColor).toBe('rgb(5, 150, 105)'); // #059669
    });

    test('shows Editor badge for editor permission', () => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_WITH_COLOR],
        currentWorkspace: WORKSPACE_WITH_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
      renderSwitcher();
      const badge = screen.getByText('Editor');
      expect(badge).toBeInTheDocument();
    });
  });

  // ----- Delete workspace flow -----
  describe('Delete Workspace (owner only)', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_NO_COLOR],
        currentWorkspace: WORKSPACE_NO_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('shows delete option in dropdown for owner', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.getByText('Delete Workspace')).toBeInTheDocument();
    });

    test('does NOT show delete option for non-owner', () => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_WITH_COLOR_2],
        currentWorkspace: WORKSPACE_WITH_COLOR_2, // viewer permission
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      expect(screen.queryByText('Delete Workspace')).not.toBeInTheDocument();
    });

    test('clicking Delete shows confirmation dialog', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByText('Delete Workspace'));
      expect(screen.getByText('Delete Workspace?')).toBeInTheDocument();
      expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    });

    test('cancel button closes confirmation dialog', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByText('Delete Workspace'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Delete Workspace?')).not.toBeInTheDocument();
    });

    test('confirm delete calls deleteWorkspace', async () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      fireEvent.click(screen.getByText('Delete Workspace'));
      fireEvent.click(screen.getByText('Delete Permanently'));
      await waitFor(() => {
        expect(mockDeleteWorkspace).toHaveBeenCalledWith('ws-1');
      });
    });
  });

  // ----- Accessibility -----
  describe('Accessibility', () => {
    beforeEach(() => {
      mockWorkspacesData = {
        workspaces: [WORKSPACE_NO_COLOR],
        currentWorkspace: WORKSPACE_NO_COLOR,
        hasWorkspaces: true,
        switchWorkspace: mockSwitchWorkspace,
        deleteWorkspace: mockDeleteWorkspace,
      };
    });

    test('trigger has aria-expanded attribute', () => {
      renderSwitcher();
      const trigger = screen.getByTestId('workspace-selector');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    test('trigger has aria-haspopup=listbox', () => {
      renderSwitcher();
      expect(screen.getByTestId('workspace-selector')).toHaveAttribute('aria-haspopup', 'listbox');
    });

    test('settings button has aria-label', () => {
      renderSwitcher();
      expect(screen.getByTestId('workspace-settings-btn')).toHaveAttribute('aria-label', 'Open workspace settings');
    });

    test('dropdown options have role=option', () => {
      renderSwitcher();
      fireEvent.click(screen.getByTestId('workspace-selector'));
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThanOrEqual(1);
    });
  });
});
