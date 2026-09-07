/** @vitest-environment jsdom */
/**
 * Phase 36 — converting and cancelling a service request each require their own
 * permission.
 *
 * `firestore.rules` now admits an update to `serviceRequests/{id}` only for a
 * caller holding `serviceRequests.convert` OR `serviceRequests.cancel`. A rule
 * cannot tell the two apart — by the time the write arrives they differ only in
 * field values the client controls — so the finer distinction is enforced here,
 * in the UI, and this test is what holds it in place.
 *
 * Both controls are DISABLED with an explanatory title rather than hidden.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockHasPermission = vi.fn();

/** One pending request, delivered synchronously to the page's subscription. */
const pendingRequest: any = {
  id: 'req-1',
  status: 'Pending',
  customerCompanyName: 'Acme Testing Ltd',
  customerName: 'A. Person',
  customerEmail: 'a@example.com',
  customerPhone: '000',
  equipment: [],
  createdAt: new Date(),
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../services/serviceRequestService', () => ({
  serviceRequestService: {
    subscribeToServiceRequests: (
      cb: (requests: any[], err?: Error) => void,
    ) => {
      cb([pendingRequest]);
      return () => {};
    },
    convertToJob: vi.fn(),
    cancelServiceRequest: vi.fn(),
  },
}));

vi.mock('../../services/jobService', () => ({
  jobService: { createJob: vi.fn() },
}));

const STABLE_TOAST = { success: vi.fn(), error: vi.fn() };
vi.mock('../../hooks/useToast', () => ({
  useToast: () => STABLE_TOAST,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1', role: 'staff' }, loading: false }),
}));

vi.mock('../../components/ServiceRequestModal', () => ({
  ServiceRequestModal: () => null,
}));

vi.mock('../../hooks/usePermission', () => ({
  usePermission: (permission: string) => ({
    hasPermission: mockHasPermission(permission),
    loading: false,
  }),
}));

import { PendingJobsPage } from '../PendingJobsPage';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

/** Grant exactly the permissions named; refuse everything else. */
function renderGranting(...granted: string[]) {
  mockHasPermission.mockImplementation((p: string) => granted.includes(p));
  return render(<PendingJobsPage />);
}

const convertButton = () =>
  screen.getByRole('button', { name: /Convert to Job/i }) as HTMLButtonElement;
const cancelButton = () =>
  screen.getByRole('button', { name: /Cancel Request/i }) as HTMLButtonElement;

describe('PendingJobsPage — Convert is gated on serviceRequests.convert (Phase 36)', () => {
  it('a user WITHOUT the permission sees Convert disabled, and is told who to ask', () => {
    renderGranting('serviceRequests.cancel');

    const btn = convertButton();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/cannot convert service requests/i);
    expect(btn.getAttribute('title')).toMatch(/administrator/i);
  });

  it('a user WITH the permission sees Convert enabled', () => {
    renderGranting('serviceRequests.convert');

    const btn = convertButton();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('Convert this request to a job');
  });
});

describe('PendingJobsPage — Cancel is gated on serviceRequests.cancel (Phase 36)', () => {
  it('a user WITHOUT the permission sees Cancel disabled, and is told who to ask', () => {
    renderGranting('serviceRequests.convert');

    const btn = cancelButton();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/cannot cancel service requests/i);
    expect(btn.getAttribute('title')).toMatch(/administrator/i);
  });

  it('a user WITH the permission sees Cancel enabled', () => {
    renderGranting('serviceRequests.cancel');

    const btn = cancelButton();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('Cancel this request');
  });
});

describe('PendingJobsPage — the two permissions are independent', () => {
  it('holding neither disables both controls, and neither disappears', () => {
    renderGranting();

    expect(convertButton().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);
    // Still on screen — a vanished button cannot be explained to its user.
    expect(screen.queryByRole('button', { name: /Convert to Job/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Cancel Request/i })).not.toBeNull();
  });

  it('holding both enables both controls', () => {
    renderGranting('serviceRequests.convert', 'serviceRequests.cancel');

    expect(convertButton().disabled).toBe(false);
    expect(cancelButton().disabled).toBe(false);
  });

  it('consults exactly the two serviceRequests permissions', () => {
    renderGranting('serviceRequests.convert', 'serviceRequests.cancel');

    expect(mockHasPermission).toHaveBeenCalledWith('serviceRequests.convert');
    expect(mockHasPermission).toHaveBeenCalledWith('serviceRequests.cancel');
  });
});
