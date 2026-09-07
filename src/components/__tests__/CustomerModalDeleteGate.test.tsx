/** @vitest-environment jsdom */
/**
 * Phase 36 — deleting a customer requires `customers.delete`.
 *
 * `firestore.rules` now refuses the delete without that permission, so the UI
 * must stop offering it. A button the database will reject is the exact bug
 * that started the 34-37 series: a Standard user pressed Generate and got a raw
 * `Missing or insufficient permissions.`
 *
 * The control is DISABLED with an explanatory title rather than hidden, so the
 * user can tell "not allowed" from "not there".
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockHasPermission = vi.fn();

vi.mock('../../services/firebase', () => ({
  db: {},
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  serverTimestamp: vi.fn(),
}));

vi.mock('../../hooks/usePermission', () => ({
  usePermission: (permission: string) => ({
    hasPermission: mockHasPermission(permission),
    loading: false,
  }),
}));

import { CustomerModal, CUSTOMER_DELETE_NOT_PERMITTED_TITLE } from '../CustomerModal';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

/** An existing customer — the Delete control only renders when editing one. */
const existingCustomer: any = {
  customerCode: 'C1',
  name: 'Acme Testing Ltd',
  contact: 'A. Person',
  address: '1 Lab Street',
  email: 'a@example.com',
  phone: '000',
};

function renderWithPermission(granted: boolean) {
  mockHasPermission.mockImplementation((p: string) =>
    p === 'customers.delete' ? granted : true
  );

  return render(
    <CustomerModal customer={existingCustomer} onClose={() => {}} onSuccess={() => {}} />
  );
}

function findDeleteButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
}

describe('CustomerModal — Delete is gated on customers.delete (Phase 36)', () => {
  it('a user WITHOUT customers.delete sees Delete disabled, and is told who to ask', () => {
    renderWithPermission(false);

    const btn = findDeleteButton();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe(CUSTOMER_DELETE_NOT_PERMITTED_TITLE);
  });

  it('a user WITH customers.delete sees Delete enabled', () => {
    renderWithPermission(true);

    const btn = findDeleteButton();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('Delete this customer');
  });

  it('consults exactly the customers.delete permission', () => {
    renderWithPermission(true);
    expect(mockHasPermission).toHaveBeenCalledWith('customers.delete');
  });

  it('explains rather than vanishing — the control is present either way', () => {
    renderWithPermission(false);
    // Present in the document, not removed: a missing button is indistinguishable
    // from a broken one.
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeNull();
    expect(CUSTOMER_DELETE_NOT_PERMITTED_TITLE).toMatch(/administrator/i);
  });
});
