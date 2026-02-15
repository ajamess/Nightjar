/**
 * tests/contexts/InventoryContext.test.jsx
 *
 * Unit tests for InventoryContext and useInventory hook.
 * See docs/INVENTORY_SYSTEM_SPEC.md §11.2.4b
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { InventoryProvider, useInventory } from '../../frontend/src/contexts/InventoryContext';
import {
  createMockYMap,
  createMockYArray,
  createTestIdentity,
} from '../helpers/inventory-test-utils';

// Test consumer component
function TestConsumer() {
  const ctx = useInventory();
  return (
    <div>
      <span data-testid="systemId">{ctx.inventorySystemId}</span>
      <span data-testid="workspaceId">{ctx.workspaceId}</span>
      <span data-testid="userName">{ctx.userIdentity?.displayName}</span>
    </div>
  );
}

describe('InventoryContext', () => {
  const defaultProps = {
    inventorySystemId: 'sys-1',
    workspaceId: 'ws-1',
    yInventorySystems: createMockYMap(),
    yCatalogItems: createMockYArray(),
    yInventoryRequests: createMockYArray(),
    yProducerCapacities: createMockYMap(),
    yAddressReveals: createMockYMap(),
    yPendingAddresses: createMockYMap(),
    yInventoryAuditLog: createMockYArray(),
    userIdentity: createTestIdentity({ displayName: 'Alice' }),
    collaborators: [],
  };

  it('should provide context values to children', () => {
    render(
      <InventoryProvider {...defaultProps}>
        <TestConsumer />
      </InventoryProvider>
    );

    expect(screen.getByTestId('systemId')).toHaveTextContent('sys-1');
    expect(screen.getByTestId('workspaceId')).toHaveTextContent('ws-1');
    expect(screen.getByTestId('userName')).toHaveTextContent('Alice');
  });

  it('should throw when useInventory is used outside provider', () => {
    // Suppress console.error for expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useInventory must be used within an InventoryProvider');
    spy.mockRestore();
  });

  it('should expose all Yjs shared types', () => {
    function TypeChecker() {
      const ctx = useInventory();
      return (
        <div>
          <span data-testid="hasSystems">{!!ctx.yInventorySystems ? 'yes' : 'no'}</span>
          <span data-testid="hasCatalog">{!!ctx.yCatalogItems ? 'yes' : 'no'}</span>
          <span data-testid="hasRequests">{!!ctx.yInventoryRequests ? 'yes' : 'no'}</span>
          <span data-testid="hasCapacities">{!!ctx.yProducerCapacities ? 'yes' : 'no'}</span>
          <span data-testid="hasReveals">{!!ctx.yAddressReveals ? 'yes' : 'no'}</span>
          <span data-testid="hasPending">{!!ctx.yPendingAddresses ? 'yes' : 'no'}</span>
          <span data-testid="hasAuditLog">{!!ctx.yInventoryAuditLog ? 'yes' : 'no'}</span>
        </div>
      );
    }

    render(
      <InventoryProvider {...defaultProps}>
        <TypeChecker />
      </InventoryProvider>
    );

    expect(screen.getByTestId('hasSystems')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasCatalog')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasRequests')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasCapacities')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasReveals')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasPending')).toHaveTextContent('yes');
    expect(screen.getByTestId('hasAuditLog')).toHaveTextContent('yes');
  });

  it('should expose collaborators array', () => {
    function CollabChecker() {
      const ctx = useInventory();
      return <span data-testid="collabs">{ctx.collaborators.length}</span>;
    }

    render(
      <InventoryProvider {...defaultProps} collaborators={[{ publicKey: 'pk1' }, { publicKey: 'pk2' }]}>
        <CollabChecker />
      </InventoryProvider>
    );

    expect(screen.getByTestId('collabs')).toHaveTextContent('2');
  });
});
