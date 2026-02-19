/**
 * WorkspaceSyncContext
 * 
 * Provides synced workspace data (documents, folders, members, etc.) to the entire app.
 * This context wraps FolderProvider and App so both can access the synced data.
 * 
 * This solves the architecture issue where:
 * 1. useWorkspaceSync creates a Yjs connection to workspace-meta:{workspaceId}
 * 2. FolderContext was creating its own Yjs connection to workspace-folders:{workspaceId}
 * 3. P2P only syncs workspace-meta, so folders never reached FolderContext
 * 
 * Now all synced data comes from this single context.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useWorkspaces } from './WorkspaceContext';
import { useIdentity } from './IdentityContext';
import { useWorkspaceSync } from '../hooks/useWorkspaceSync';
import { loadUserProfile } from '../components/UserProfile';

const WorkspaceSyncContext = createContext(null);

export function WorkspaceSyncProvider({ children }) {
  const { currentWorkspaceId, currentWorkspace } = useWorkspaces();
  const { publicIdentity } = useIdentity();
  
  // Derive user profile from reactive publicIdentity so awareness updates
  // when the user changes their name/color/icon. Falls back to localStorage
  // while identity is still loading.
  const workspaceUserProfile = useMemo(() => {
    if (publicIdentity) {
      return {
        name: publicIdentity.handle || 'Anonymous',
        color: publicIdentity.color || '#6366f1',
        icon: publicIdentity.icon || '😊',
      };
    }
    // Fallback to localStorage while identity is loading
    const stored = loadUserProfile();
    return {
      name: stored.name,
      color: stored.color,
      icon: stored.icon,
    };
  }, [publicIdentity?.handle, publicIdentity?.color, publicIdentity?.icon]);
  
  // Remote server URL for cross-platform workspaces
  const workspaceServerUrl = currentWorkspace?.serverUrl || null;
  
  // Initial workspace info - only used when creating a new workspace (owner)
  const initialWorkspaceInfo = currentWorkspace ? {
    name: currentWorkspace.name,
    icon: currentWorkspace.icon,
    color: currentWorkspace.color,
    createdBy: currentWorkspace.createdBy,
  } : null;
  
  // Get all synced data from useWorkspaceSync
  const syncData = useWorkspaceSync(
    currentWorkspaceId,
    initialWorkspaceInfo,
    workspaceUserProfile,
    workspaceServerUrl,
    publicIdentity,
    currentWorkspace?.myPermission
  );
  
  return (
    <WorkspaceSyncContext.Provider value={syncData}>
      {children}
    </WorkspaceSyncContext.Provider>
  );
}

export function useWorkspaceSyncContext() {
  const context = useContext(WorkspaceSyncContext);
  if (!context) {
    throw new Error('useWorkspaceSyncContext must be used within a WorkspaceSyncProvider');
  }
  return context;
}

export default WorkspaceSyncContext;
