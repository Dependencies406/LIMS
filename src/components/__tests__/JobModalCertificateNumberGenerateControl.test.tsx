/** @vitest-environment jsdom */
/**
 * Phase 35D — the Generate certificate-number control is open to every signed-in
 * user.
 *
 * This file replaces `JobModalCertificateNumberAdminGate.test.tsx`, which
 * asserted the opposite: that a non-admin saw the control DISABLED. That gate
 * was the interim measure added in Phase 35A, and was always labelled temporary.
 * It existed because allocating wrote to `certificate_number_configs`, which
 * `firestore.rules:161-165` permits only for admins, so a technician pressing
 * Generate got a raw `Missing or insufficient permissions.`
 *
 * Allocation now happens in the `allocateCertificateNumber` Cloud Function using
 * the Admin SDK (ADR-019 D3), so the rule no longer stands in the way, and
 * **ADR-019 D2 is explicit that any authenticated user may allocate** — taking a
 * number is clerical, and no permission switch guards it. Asserting the gate is
 * gone is therefore asserting the whole point of the 35 series.
 *
 * JobModal renders the control at TWO places — the card view and the table view
 * — and it is easy to fix one and believe both are fixed. This test therefore
 * checks both, for both roles.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// ── Mocks: JobModal pulls in Firebase, routing and a dozen services that have
//    nothing to do with the control under test. Stub them at the module edge. ──

const mockUseAuth = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  db: {},
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// NOTE: these hook results MUST be stable references across renders.
// `JobModal.tsx` runs an effect on `[currentJob, users]` that calls setForm with
// a fresh object; a mock returning a new `users` array each render loops forever
// and exhausts the heap.
const STABLE_USERS = { users: [] as unknown[], loading: false, error: null };
vi.mock('../../hooks/useUsers', () => ({
  useUsers: () => STABLE_USERS,
}));

// Every job permission granted, so nothing but the role could explain a
// disabled control.
const STABLE_PERMISSION = { hasPermission: true, loading: false };
vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => STABLE_PERMISSION,
}));

vi.mock('../../services/jobIdService', () => ({
  getNextJobId: vi.fn(async () => 'JOB-001'),
  incrementJobIdSequence: vi.fn(),
}));

vi.mock('../../services/certificateNumberConfigService', () => ({
  certificateNumberConfigService: {
    subscribeToEquipmentNames: vi.fn(() => () => {}),
    getConfigByEquipmentName: vi.fn(async () => null),
  },
}));

vi.mock('../../services/certificateNumberGeneratorService', () => ({
  generateCertificateNumberForEquipment: vi.fn(),
}));

vi.mock('../../services/manufacturerListService', () => ({
  getManufacturerNames: vi.fn(async () => []),
}));

vi.mock('../../services/modelListService', () => ({
  getModelNames: vi.fn(async () => []),
}));

vi.mock('../../services/calibrationMethodListService', () => ({
  getCalibrationMethodNames: vi.fn(async () => []),
}));

vi.mock('../../services/userService', () => ({
  matchUserFromAssignedStaffValue: vi.fn(() => null),
}));

vi.mock('../../services/jobService', () => ({
  jobService: { deleteJob: vi.fn() },
}));

vi.mock('../../services/customerService', () => ({
  customerService: { createCustomer: vi.fn() },
}));

vi.mock('../../services/customerIdService', () => ({
  getNextCustomerId: vi.fn(async () => 'CUST-001'),
  incrementCustomerIdSequence: vi.fn(),
}));

vi.mock('../SignatureCanvas', () => ({ SignatureCanvas: () => null }));
vi.mock('../EquipmentFileUpload', () => ({ EquipmentFileUpload: () => null }));
vi.mock('../TemplateBasedPdfPreviewModal', () => ({ TemplateBasedPdfPreviewModal: () => null }));
vi.mock('../StatementOfConformityPdfUpload', () => ({ StatementOfConformityPdfUpload: () => null }));
vi.mock('../JobAttachmentsPanel', () => ({ JobAttachmentsPanel: () => null }));
vi.mock('../common', () => ({
  IconButton: (props: any) => <button type="button" {...props} />,
  PlusIcon: () => null,
  DuplicateIcon: () => null,
}));

import { JobModal } from '../JobModal';

// This project has no global RTL setupFiles — cleanup is not automatic.
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

/** A saved job with one item, so `!currentJob` is not what disables the control. */
const savedJob: any = {
  id: 'job-1',
  jobId: 'JOB-001',
  title: 'Test job',
  status: 'In Progress',
  customerCode: 'C1',
  customerName: 'Acme',
  equipment: [
    {
      id: 'eq-1',
      name: 'Universal Testing Machine',
      manufacturer: '',
      model: '',
      serialNumber: '',
      assetTag: '',
      calibrationPoint: '',
      unit: '',
      calibrationMethods: '',
      accessories: '',
      machineLocation: '',
      calibrationDate: '',
      remark: '',
      certificateNumber: '',   // blank, so "already generated" is not the disabler
    },
  ],
};

function renderAsRole(isAdmin: boolean) {
  mockUseAuth.mockReturnValue({
    currentUser: { uid: 'u1', role: isAdmin ? 'Admin' : 'Standard user' },
    isAdmin,
    loading: false,
  });

  const view = render(
    <JobModal
      job={savedJob}
      customers={[]}
      onClose={() => {}}
      onSuccess={() => {}}
    />,
  );

  // The certificate-number control lives on the Items tab.
  fireEvent.click(screen.getByRole('tab', { name: /Items/i }));
  return view;
}

/** The Generate control. There is only one title for it now. */
function findGenerateControl(): HTMLButtonElement {
  return screen.getAllByTitle('Generate certificate number')[0] as HTMLButtonElement;
}

function switchToTableView() {
  fireEvent.click(screen.getByTitle('Table view — review all at once'));
}

/** The certificate-number input in whichever view is showing. */
function findCertificateInput(): HTMLInputElement {
  const input =
    screen.queryByPlaceholderText('Certificate number') ??
    screen.getByPlaceholderText('Cert. no.');
  return input as HTMLInputElement;
}

describe('JobModal — any signed-in user may allocate a certificate number (ADR-019 D2)', () => {
  describe('card view', () => {
    it('a NON-ADMIN sees Generate enabled — the interim admin gate is gone', () => {
      renderAsRole(false);

      const btn = findGenerateControl();
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('title')).toBe('Generate certificate number');
    });

    it('an admin sees Generate enabled too — the change took nothing away', () => {
      renderAsRole(true);

      const btn = findGenerateControl();
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('title')).toBe('Generate certificate number');
    });
  });

  describe('table view — the second render site', () => {
    it('a NON-ADMIN sees Generate enabled', () => {
      renderAsRole(false);
      switchToTableView();

      const btn = findGenerateControl();
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('title')).toBe('Generate certificate number');
    });

    it('an admin sees Generate enabled', () => {
      renderAsRole(true);
      switchToTableView();

      const btn = findGenerateControl();
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('title')).toBe('Generate certificate number');
    });
  });

  it('no control anywhere still advertises the retired admin-only explanation', () => {
    renderAsRole(false);

    expect(screen.queryByTitle(/Only an administrator can allocate/i)).toBeNull();
    switchToTableView();
    expect(screen.queryByTitle(/Only an administrator can allocate/i)).toBeNull();
  });

  it('leaves the certificate-number input editable, so a number can still be typed in by hand', () => {
    renderAsRole(false);

    const input = findCertificateInput();
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);

    fireEvent.change(input, { target: { value: 'SCS-UMT-26001' } });
    expect(findCertificateInput().value).toBe('SCS-UMT-26001');
  });
});
