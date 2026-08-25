/** @vitest-environment jsdom */
/**
 * RecordSignOffModal.test.tsx
 *
 * Phase 23 Task 2 — the signer name is a fixed, caller-supplied prop, never
 * an editable field: the Firestore rule enforces `reviewedBy`/`approvedBy
 * == request.auth.uid`, so whatever name is printed must always match the
 * account actually performing the action. These tests prove there is no
 * way, from inside this modal, to change the signer to someone else.
 *
 * `SignatureCanvas` itself needs a real canvas 2D context (getImageData,
 * etc.) that jsdom does not implement — it is mocked here to a minimal
 * stand-in exposing just the `onChange`/`signerName`/`showSignerNameInput`
 * contract this modal depends on, so these tests exercise
 * RecordSignOffModal's own logic without depending on canvas drawing.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../../components/SignatureCanvas', () => ({
  SignatureCanvas: ({ onChange, signerName, showSignerNameInput }: any) => (
    <div>
      <div data-testid="signature-canvas-props">
        {JSON.stringify({ signerName, showSignerNameInput })}
      </div>
      <button type="button" onClick={() => onChange({ signatureData: 'data:image/png;base64,x', signerName, signedDate: new Date() })}>
        Simulate draw
      </button>
    </div>
  ),
}));

import { RecordSignOffModal } from '../RecordSignOffModal';

afterEach(cleanup);

describe('RecordSignOffModal — Phase 23 Task 2: signer name is fixed', () => {
  it('test 7: shows the caller-supplied signer name as read-only text', () => {
    render(
      <RecordSignOffModal title="Review Record" signerName="Jane Metrologist" onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText('Jane Metrologist')).toBeTruthy();
  });

  it('renders no editable text input for the signer name anywhere in the modal', () => {
    render(
      <RecordSignOffModal title="Review Record" signerName="Jane Metrologist" onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    // SignatureCanvas is told to hide its own free-text "Signer Name" input.
    const propsDump = screen.getByTestId('signature-canvas-props').textContent;
    expect(propsDump).toContain('"showSignerNameInput":false');
    // And there is no plain <input type="text"> anywhere for a name.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('the confirmed signature always carries the caller-supplied name, regardless of what SignatureCanvas itself embedded', () => {
    const onConfirm = vi.fn();
    render(
      <RecordSignOffModal title="Approve Record" signerName="Jane Metrologist" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByText('Simulate draw'));
    fireEvent.click(screen.getByText(/Confirm/));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].signerName).toBe('Jane Metrologist');
  });

  it('a different signerName prop produces a different (still fixed) confirmed name — proving it is caller-controlled, not user-editable', () => {
    const onConfirm = vi.fn();
    render(
      <RecordSignOffModal title="Approve Record" signerName="Someone Else" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByText('Simulate draw'));
    fireEvent.click(screen.getByText(/Confirm/));

    expect(onConfirm.mock.calls[0][0].signerName).toBe('Someone Else');
  });
});
