/**
 * tests/contexts/ToastContext.test.jsx
 *
 * Unit tests for ToastContext, useToast, and ToastProvider.
 * Verifies BEM className pattern: toast toast--${type} per §11.2.4a
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../../frontend/src/contexts/ToastContext';

// Test consumer that triggers toasts
function TestConsumer({ type = 'info', message = 'Hello' }) {
  const { showToast, dismissToast, toast } = useToast();
  return (
    <div>
      <button data-testid="trigger" onClick={() => showToast(message, type)}>Show</button>
      <button data-testid="dismiss" onClick={() => dismissToast()}>Dismiss</button>
      {toast && <span data-testid="toast-type">{toast.type}</span>}
    </div>
  );
}

describe('ToastContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should throw when useToast is used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });

  it('should show a toast with correct type', () => {
    render(
      <ToastProvider>
        <TestConsumer type="success" message="Saved!" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));

    const toastEl = screen.getByRole('alert');
    expect(toastEl).toBeInTheDocument();
    expect(toastEl).toHaveClass('toast');
    expect(toastEl).toHaveClass('toast--success');
  });

  it('should use BEM pattern: toast toast--${type} for all types', () => {
    const types = ['info', 'success', 'error', 'warning'];

    for (const type of types) {
      const { unmount } = render(
        <ToastProvider>
          <TestConsumer type={type} message={`Test ${type}`} />
        </ToastProvider>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      const toastEl = screen.getByRole('alert');
      expect(toastEl.className).toContain(`toast--${type}`);
      unmount();
    }
  });

  it('should display the correct icon for each type', () => {
    const typeIcons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    for (const [type, icon] of Object.entries(typeIcons)) {
      const { unmount } = render(
        <ToastProvider>
          <TestConsumer type={type} message={`Test ${type}`} />
        </ToastProvider>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      const toastEl = screen.getByRole('alert');
      expect(toastEl.textContent).toContain(icon);
      unmount();
    }
  });

  it('should display the message', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Operation completed" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('alert')).toHaveTextContent('Operation completed');
  });

  it('should auto-dismiss after 3 seconds', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Auto dismiss" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should dismiss when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Dismiss me" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Dismiss notification');
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should dismiss via dismissToast', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Dismiss me" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should replace previous toast when showing a new one', () => {
    function MultiToast() {
      const { showToast } = useToast();
      return (
        <div>
          <button data-testid="toast1" onClick={() => showToast('First', 'info')}>First</button>
          <button data-testid="toast2" onClick={() => showToast('Second', 'error')}>Second</button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <MultiToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('toast1'));
    expect(screen.getByRole('alert')).toHaveTextContent('First');

    fireEvent.click(screen.getByTestId('toast2'));
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Second');
    expect(alerts[0]).toHaveClass('toast--error');
  });

  it('should have aria-live="polite" for accessibility', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Accessible" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByTestId('trigger'));
    const toastEl = screen.getByRole('alert');
    expect(toastEl).toHaveAttribute('aria-live', 'polite');
  });
});
