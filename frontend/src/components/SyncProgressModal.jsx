/**
 * SyncProgressModal Component
 * 
 * Displayed when a user joins a workspace via share link.
 * Shows sync progress phases and handles retry/expiration.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './SyncProgressModal.css';

const SYNC_PHASES = {
  'idle': { label: 'Preparing...', icon: '⏳', progress: 0 },
  'connecting': { label: 'Connecting to network...', icon: '🔗', progress: 15 },
  'awaiting-peers': { label: 'Finding peers...', icon: '🔍', progress: 30 },
  'receiving-metadata': { label: 'Receiving workspace info...', icon: '📦', progress: 60 },
  'receiving-documents': { label: 'Syncing documents...', icon: '📄', progress: 85 },
  'complete': { label: 'Sync complete!', icon: '✅', progress: 100 },
  'failed': { label: 'Connection failed', icon: '❌', progress: 0 },
  'expired': { label: 'Link expired', icon: '⏰', progress: 0 },
};

export default function SyncProgressModal({ 
  phase = 'idle',
  progress = {},
  expiresAt = null,
  onRetry,
  onCancel,
  onClose,
  workspaceName = 'workspace',
}) {
  const modalRef = useRef(null);
  
  // Live clock so time-based memos recompute every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  
  // Focus trap for accessibility
  useFocusTrap(modalRef, true);

  // Calculate time remaining until expiration
  const timeRemaining = useMemo(() => {
    if (!expiresAt) return null;
    const expires = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
    const remaining = expires - now;
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
    if (minutes > 0) return `${minutes}m remaining`;
    return 'Less than a minute';
  }, [expiresAt, now]);

  const isExpired = timeRemaining === 'Expired';
  const isError = phase === 'failed' || phase === 'expired';
  const isComplete = phase === 'complete';
  
  // Get phase info
  const phaseInfo = SYNC_PHASES[phase] || SYNC_PHASES['idle'];

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && (isComplete || isError)) {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isComplete, isError]);

  // Calculate elapsed time
  const elapsedTime = useMemo(() => {
    if (!progress.startTime) return null;
    const elapsed = now - progress.startTime;
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }, [progress.startTime, now]);

  return (
    <div className="sync-progress-modal-overlay">
      <div 
        className="sync-progress-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-progress-title"
        aria-describedby="sync-progress-message"
      >
        <div className={`sync-progress-modal__icon ${isError ? 'error' : isComplete ? 'success' : 'syncing'}`}>
          <span className="sync-progress-modal__icon-emoji">{phaseInfo.icon}</span>
        </div>
        
        <h2 id="sync-progress-title" className="sync-progress-modal__title">
          {isComplete ? 'Joined Successfully!' : isError ? 'Sync Failed' : `Joining ${workspaceName}`}
        </h2>
        
        <p id="sync-progress-message" className="sync-progress-modal__message">
          {phaseInfo.label}
        </p>
        
        {/* Progress bar */}
        {!isError && (
          <div className="sync-progress-modal__progress">
            <div 
              className="sync-progress-modal__progress-bar"
              style={{ width: `${phaseInfo.progress}%` }}
            />
          </div>
        )}
        
        {/* Stats */}
        {progress.documentsReceived > 0 && (
          <div className="sync-progress-modal__stats">
            <div className="sync-progress-modal__stat">
              <span className="sync-progress-modal__stat-value">{progress.documentsReceived}</span>
              <span className="sync-progress-modal__stat-label">Documents</span>
            </div>
            {progress.foldersReceived > 0 && (
              <div className="sync-progress-modal__stat">
                <span className="sync-progress-modal__stat-value">{progress.foldersReceived}</span>
                <span className="sync-progress-modal__stat-label">Folders</span>
              </div>
            )}
            {progress.membersReceived > 0 && (
              <div className="sync-progress-modal__stat">
                <span className="sync-progress-modal__stat-value">{progress.membersReceived}</span>
                <span className="sync-progress-modal__stat-label">Members</span>
              </div>
            )}
          </div>
        )}
        
        {/* Elapsed time */}
        {elapsedTime && !isComplete && !isError && (
          <p className="sync-progress-modal__elapsed">
            Elapsed: {elapsedTime}
          </p>
        )}
        
        {/* Expiration warning */}
        {timeRemaining && !isComplete && (
          <div className={`sync-progress-modal__expiry ${isExpired ? 'expired' : ''}`}>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{isExpired ? 'This link has expired' : `Link expires: ${timeRemaining}`}</span>
          </div>
        )}
        
        {/* Error message */}
        {progress.error && (
          <div className="sync-progress-modal__error">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{progress.error}</span>
          </div>
        )}
        
        {/* Actions */}
        <div className="sync-progress-modal__actions">
          {isError && !isExpired && onRetry && (
            <button 
              className="sync-progress-modal__button sync-progress-modal__button--primary"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          
          {isComplete && (
            <button 
              className="sync-progress-modal__button sync-progress-modal__button--primary"
              onClick={onClose}
            >
              Get Started
            </button>
          )}
          
          {(isError || !isComplete) && (
            <button 
              className="sync-progress-modal__button sync-progress-modal__button--secondary"
              onClick={onCancel || onClose}
            >
              {isError ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
