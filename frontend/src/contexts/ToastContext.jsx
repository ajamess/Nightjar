/**
 * ToastContext
 * 
 * Provides showToast(message, type) to all components in the tree.
 * Follows the PresenceContext pattern: createContext(null) → custom hook with null-check → Provider with useMemo.
 * 
 * See docs/INVENTORY_SYSTEM_SPEC.md §11.2.4a
 */

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';

const ToastContext = createContext(null);

/**
 * Hook to show toasts from any component.
 * Must be used within a ToastProvider.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Provider that manages toast state and renders the toast element.
 * Includes swipe-to-dismiss on touch devices.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);
  const toastRef = useRef(null);
  const swipeStartRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ message, type });
    timeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const dismissToast = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast(null);
  }, []);

  // Swipe-to-dismiss touch handlers
  const handleTouchStart = useCallback((e) => {
    swipeStartRef.current = e.touches[0].clientX;
    if (toastRef.current) toastRef.current.style.transition = 'none';
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (swipeStartRef.current == null || !toastRef.current) return;
    const dx = e.touches[0].clientX - swipeStartRef.current;
    // Only allow rightward swipe (positive dx)
    if (dx > 0) {
      toastRef.current.style.transform = `translateX(${dx}px)`;
      toastRef.current.style.opacity = String(Math.max(0, 1 - dx / 200));
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (swipeStartRef.current == null || !toastRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current;
    swipeStartRef.current = null;
    if (dx > 80) {
      // Swipe far enough — dismiss
      toastRef.current.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      toastRef.current.style.transform = 'translateX(120%)';
      toastRef.current.style.opacity = '0';
      setTimeout(dismissToast, 200);
    } else {
      // Snap back
      toastRef.current.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      toastRef.current.style.transform = '';
      toastRef.current.style.opacity = '';
    }
  }, [dismissToast]);

  const value = useMemo(() => ({ toast, showToast, dismissToast }), [toast, showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          ref={toastRef}
          className={`toast toast--${toast.type}`}
          role="alert"
          aria-live="polite"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <span className="toast__icon">
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'warning' && '⚠'}
            {toast.type === 'info' && 'ℹ'}
          </span>
          <span className="toast__message">{toast.message}</span>
          <button
            className="toast__close"
            onClick={dismissToast}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export default ToastContext;
