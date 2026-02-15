/**
 * FileStorageDashboard
 * 
 * Shell component for the file storage feature.
 * Wraps children in FileStorageProvider, renders nav rail + content router.
 * Follows the InventoryDashboard pattern exactly.
 * 
 * See docs/FILE_STORAGE_SPEC.md §5
 */

import { useState, useMemo, useCallback } from 'react';
import { FileStorageProvider, useFileStorage } from '../../contexts/FileStorageContext';
import FileStorageNavRail, { FILE_VIEWS } from './FileStorageNavRail';
import './FileStorageDashboard.css';

/**
 * View IDs for the content area.
 * These correspond to nav rail items.
 */
export const VIEWS = {
  BROWSE: FILE_VIEWS.BROWSE,
  RECENT: FILE_VIEWS.RECENT,
  DOWNLOADS: FILE_VIEWS.DOWNLOADS,
  FAVORITES: FILE_VIEWS.FAVORITES,
  TRASH: FILE_VIEWS.TRASH,
  AUDIT_LOG: FILE_VIEWS.AUDIT_LOG,
  STORAGE: FILE_VIEWS.STORAGE,
  SETTINGS: FILE_VIEWS.SETTINGS,
};

/** Inner content component – consumes FileStorageContext */
function FileStorageContent({ onClose }) {
  const [activeView, setActiveView] = useState(VIEWS.BROWSE);
  const ctx = useFileStorage();

  const {
    activeFiles,
    trashedFiles,
    activeFolders,
    totalFileCount,
    totalSizeBytes,
    sizeByCategory,
    auditLog,
    currentSystem,
    userIdentity,
  } = ctx;

  // Compute badge counts
  const trashedCount = trashedFiles?.length || 0;
  const favoriteCount = useMemo(() => {
    const pk = userIdentity?.publicKeyBase62;
    if (!pk || !activeFiles) return 0;
    return activeFiles.filter(f => f.favoritedBy?.includes(pk)).length;
  }, [activeFiles, userIdentity]);

  // Determine user role for nav rail
  const role = useMemo(() => {
    const system = currentSystem;
    if (!system || !userIdentity) return 'collaborator';
    if (system.createdBy === userIdentity.publicKeyBase62) return 'admin';
    return 'collaborator';
  }, [currentSystem, userIdentity]);

  const handleViewChange = useCallback((viewId) => {
    setActiveView(viewId);
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case VIEWS.BROWSE:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-browse">
            <div className="fs-content-header">
              <h2>Browse Files</h2>
              <div className="fs-content-stats">
                <span>{totalFileCount} file{totalFileCount !== 1 ? 's' : ''}</span>
                <span>•</span>
                <span>{formatSize(totalSizeBytes)}</span>
              </div>
            </div>
            <div className="fs-content-body">
              {activeFiles && activeFiles.length > 0 ? (
                <div className="fs-file-list">
                  {activeFiles.map(file => (
                    <div key={file.id} className="fs-file-item" data-testid={`fs-file-${file.id}`}>
                      <span className="fs-file-name">{file.name}</span>
                      <span className="fs-file-size">{formatSize(file.sizeBytes)}</span>
                      <span className="fs-file-date">{new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="fs-empty-state">
                  <span className="fs-empty-icon">📂</span>
                  <p>No files yet</p>
                  <p className="fs-empty-hint">Upload a file to get started</p>
                </div>
              )}
            </div>
          </div>
        );

      case VIEWS.RECENT:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-recent">
            <div className="fs-content-header">
              <h2>Recent Files</h2>
            </div>
            <div className="fs-content-body">
              {activeFiles && activeFiles.length > 0 ? (
                <div className="fs-file-list">
                  {[...activeFiles]
                    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
                    .slice(0, 20)
                    .map(file => (
                      <div key={file.id} className="fs-file-item" data-testid={`fs-file-${file.id}`}>
                        <span className="fs-file-name">{file.name}</span>
                        <span className="fs-file-size">{formatSize(file.sizeBytes)}</span>
                        <span className="fs-file-date">{new Date(file.updatedAt || file.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="fs-empty-state">
                  <span className="fs-empty-icon">🕑</span>
                  <p>No recent activity</p>
                </div>
              )}
            </div>
          </div>
        );

      case VIEWS.DOWNLOADS:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-downloads">
            <div className="fs-content-header">
              <h2>Downloads</h2>
            </div>
            <div className="fs-content-body">
              <div className="fs-empty-state">
                <span className="fs-empty-icon">⬇️</span>
                <p>No active downloads</p>
                <p className="fs-empty-hint">Files you download will appear here</p>
              </div>
            </div>
          </div>
        );

      case VIEWS.FAVORITES:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-favorites">
            <div className="fs-content-header">
              <h2>Favorites</h2>
            </div>
            <div className="fs-content-body">
              {favoriteCount > 0 ? (
                <div className="fs-file-list">
                  {activeFiles
                    .filter(f => f.favoritedBy?.includes(userIdentity?.publicKeyBase62))
                    .map(file => (
                      <div key={file.id} className="fs-file-item" data-testid={`fs-file-${file.id}`}>
                        <span className="fs-file-name">⭐ {file.name}</span>
                        <span className="fs-file-size">{formatSize(file.sizeBytes)}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="fs-empty-state">
                  <span className="fs-empty-icon">⭐</span>
                  <p>No favorites yet</p>
                  <p className="fs-empty-hint">Star files for quick access</p>
                </div>
              )}
            </div>
          </div>
        );

      case VIEWS.TRASH:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-trash">
            <div className="fs-content-header">
              <h2>Trash</h2>
              {trashedCount > 0 && (
                <span className="fs-content-stats">{trashedCount} item{trashedCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="fs-content-body">
              {trashedFiles && trashedFiles.length > 0 ? (
                <div className="fs-file-list">
                  {trashedFiles.map(file => (
                    <div key={file.id} className="fs-file-item fs-file-trashed" data-testid={`fs-file-${file.id}`}>
                      <span className="fs-file-name">{file.name}</span>
                      <span className="fs-file-size">{formatSize(file.sizeBytes)}</span>
                      <span className="fs-file-date">Deleted {new Date(file.deletedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="fs-empty-state">
                  <span className="fs-empty-icon">🗑️</span>
                  <p>Trash is empty</p>
                </div>
              )}
            </div>
          </div>
        );

      case VIEWS.AUDIT_LOG:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-audit">
            <div className="fs-content-header">
              <h2>Audit Log</h2>
            </div>
            <div className="fs-content-body">
              {auditLog && auditLog.length > 0 ? (
                <div className="fs-audit-list">
                  {[...auditLog]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(entry => (
                      <div key={entry.id} className="fs-audit-item" data-testid={`fs-audit-${entry.id}`}>
                        <span className="fs-audit-time">{new Date(entry.timestamp).toLocaleString()}</span>
                        <span className="fs-audit-actor">{entry.actorName}</span>
                        <span className="fs-audit-summary">{entry.summary}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="fs-empty-state">
                  <span className="fs-empty-icon">📋</span>
                  <p>No audit entries</p>
                </div>
              )}
            </div>
          </div>
        );

      case VIEWS.STORAGE:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-storage">
            <div className="fs-content-header">
              <h2>Storage Overview</h2>
            </div>
            <div className="fs-content-body">
              <div className="fs-storage-stats">
                <div className="fs-storage-stat">
                  <span className="fs-storage-stat-label">Total Files</span>
                  <span className="fs-storage-stat-value">{totalFileCount}</span>
                </div>
                <div className="fs-storage-stat">
                  <span className="fs-storage-stat-label">Total Size</span>
                  <span className="fs-storage-stat-value">{formatSize(totalSizeBytes)}</span>
                </div>
                {sizeByCategory && Object.entries(sizeByCategory).map(([cat, size]) => (
                  <div key={cat} className="fs-storage-stat">
                    <span className="fs-storage-stat-label">{cat}</span>
                    <span className="fs-storage-stat-value">{formatSize(size)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case VIEWS.SETTINGS:
        return (
          <div className="fs-content-placeholder" data-testid="fs-view-settings">
            <div className="fs-content-header">
              <h2>File Storage Settings</h2>
            </div>
            <div className="fs-content-body">
              <div className="fs-settings-section">
                <p className="fs-settings-info">
                  Settings for this file storage system.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="file-storage-dashboard" data-testid="fs-dashboard">
      <FileStorageNavRail
        activeView={activeView}
        onViewChange={handleViewChange}
        role={role}
        trashedCount={trashedCount}
        favoriteCount={favoriteCount}
      />
      <div className="fs-content-area">
        {renderContent()}
      </div>
    </div>
  );
}

/** Format bytes into human-readable string */
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Main FileStorageDashboard – wraps content in Provider.
 * Called from AppNew.jsx when a file-storage type document is active.
 */
export default function FileStorageDashboard({
  fileStorageId,
  workspaceId,
  yFileStorageSystems,
  yStorageFiles,
  yStorageFolders,
  yChunkAvailability,
  yFileAuditLog,
  userIdentity,
  collaborators,
  onClose,
}) {
  return (
    <FileStorageProvider
      fileStorageId={fileStorageId}
      workspaceId={workspaceId}
      yFileStorageSystems={yFileStorageSystems}
      yStorageFiles={yStorageFiles}
      yStorageFolders={yStorageFolders}
      yChunkAvailability={yChunkAvailability}
      yFileAuditLog={yFileAuditLog}
      userIdentity={userIdentity}
      collaborators={collaborators}
    >
      <FileStorageContent onClose={onClose} />
    </FileStorageProvider>
  );
}
