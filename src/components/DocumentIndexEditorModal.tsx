import React, { useEffect, useMemo, useState } from 'react';
import type { DocumentIndexItem, DocumentIndexItemInput, DocumentIndexType, DocumentSource } from '../types';
import { documentIndexService } from '../services/documentIndexService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { uploadFile } from '../services/fileUploadService';
import { Button } from './common/Button';
import { IconButton } from './common/IconButton';

interface DocumentIndexEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initial?: DocumentIndexItem | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  existingTags?: string[];
}

const TYPES: DocumentIndexType[] = [
  'Quality Manual',
  'Quality Procedure',
  'Work Instruction',
  'Calibration Procedure',
  'Testing Procedure',
  'Form',
  'Support Document',
];

const pad2 = (v: string) => {
  const s = (v || '').replace(/\D/g, '');
  if (!s) return '01';
  return s.padStart(2, '0').slice(-2);
};

const toDateInput = (d: Date) => {
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
};

/** Parse common manual date inputs as a local Date (avoids UTC shift). */
const parseDateInputLocal = (v: string): Date | null => {
  const raw = (v || '').trim();
  if (!raw) return null;

  // ISO: YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(year, monthIndex, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // EU-ish: DD/MM/YYYY (also accepts DD-MM-YYYY)
  m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(raw);
  if (m) {
    const day = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    const year = Number(m[3]);
    const d = new Date(year, monthIndex, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
};

const parseTags = (raw: string): string[] => {
  const parts = (raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
};

const _isPdf = (s: DocumentSource | undefined): s is Extract<DocumentSource, { kind: 'pdf' }> =>
  Boolean(s && s.kind === 'pdf');

export const DocumentIndexEditorModal: React.FC<DocumentIndexEditorModalProps> = ({
  isOpen,
  mode,
  initial,
  onClose,
  onSaved,
  existingTags = [],
}) => {
  const { currentUser, isAdmin } = useAuth();
  const { hasPermission: canManage } = usePermission('documentIndex.manage');
  const { success, error: showError } = useToast();

  const canEdit = isAdmin || canManage;
  const userId = currentUser?.uid || 'system';

  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTagsFocused, setIsTagsFocused] = useState(false);

  const [form, setForm] = useState<{
    documentCode: string;
    type: DocumentIndexType;
    revisionNumber: string;
    documentName: string;
    tagsText: string;
    effectiveDate: string;
    darNumber: string;
    sourceKind: 'pdf' | 'link' | 'upload';
    sourceLinkUrl: string;
    sourcePdf?: Extract<DocumentSource, { kind: 'pdf' }>;
    darSourceKind: 'pdf' | 'link' | 'upload';
    darSourceLinkUrl: string;
    darSourcePdf?: Extract<DocumentSource, { kind: 'pdf' }>;
  }>({
    documentCode: '',
    type: 'Quality Procedure',
    revisionNumber: '01',
    documentName: '',
    tagsText: '',
    effectiveDate: '',
    darNumber: '',
    sourceKind: 'link',
    sourceLinkUrl: '',
    sourcePdf: undefined,
    darSourceKind: 'link',
    darSourceLinkUrl: '',
    darSourcePdf: undefined,
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormErrors({});
    setSaveError(null);
    if (mode === 'edit' && initial) {
      setForm({
        documentCode: initial.documentCode,
        type: initial.type,
        revisionNumber: initial.revisionNumber,
        documentName: initial.documentName,
        tagsText: (initial.tags || []).join(', '),
        effectiveDate: toDateInput(initial.effectiveDate),
        darNumber: initial.darNumber || '',
        sourceKind: initial.source.kind,
        sourceLinkUrl: initial.source.kind === 'link' ? initial.source.url : '',
        sourcePdf: initial.source.kind === 'pdf' ? initial.source : undefined,
        darSourceKind: initial.darSource?.kind || 'link',
        darSourceLinkUrl: initial.darSource?.kind === 'link' ? initial.darSource.url : '',
        darSourcePdf: initial.darSource?.kind === 'pdf' ? initial.darSource : undefined,
      });
    } else {
      setForm({
        documentCode: '',
        type: 'Quality Procedure',
        revisionNumber: '01',
        documentName: '',
        tagsText: '',
        effectiveDate: '',
        darNumber: '',
        sourceKind: 'link',
        sourceLinkUrl: '',
        sourcePdf: undefined,
        darSourceKind: 'link',
        darSourceLinkUrl: '',
        darSourcePdf: undefined,
      });
    }
  }, [isOpen, mode, initial]);

  const buildSource = (): DocumentSource | null => {
    if (form.sourceKind === 'link') {
      const url = form.sourceLinkUrl.trim();
      if (!url) return null;
      return { kind: 'link', url };
    }
    return form.sourcePdf || null;
  };

  const buildDarSource = (): DocumentSource | undefined | null => {
    if (!form.darNumber.trim()) return undefined;
    if (form.darSourceKind === 'link') {
      const url = form.darSourceLinkUrl.trim();
      if (!url) return null;
      return { kind: 'link', url };
    }
    return form.darSourcePdf || null;
  };

  const validateForm = (): { valid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    const documentCode = form.documentCode.trim();
    if (!documentCode) errors.documentCode = 'Document Code is required.';

    const documentName = form.documentName.trim();
    if (!documentName) errors.documentName = 'Document Name is required.';

    const eff = parseDateInputLocal(form.effectiveDate);
    if (!eff || Number.isNaN(eff.getTime())) {
      errors.effectiveDate = form.effectiveDate.trim()
        ? 'Effective Date must be YYYY-MM-DD or DD/MM/YYYY.'
        : 'Effective Date is required.';
    }

    if (form.sourceKind === 'link') {
      const url = form.sourceLinkUrl.trim();
      if (!url) errors.source = 'Document Source URL is required.';
      else if (!/^https?:\/\//i.test(url)) errors.source = 'Document Source URL must start with http:// or https://';
    } else {
      if (!form.sourcePdf) errors.source = 'Upload a PDF to use as the Document Source.';
    }

    const darNumber = form.darNumber.trim();
    if (darNumber) {
      if (form.darSourceKind === 'link') {
        const url = form.darSourceLinkUrl.trim();
        if (!url) errors.darSource = 'DAR Source URL is required when DAR Number is set.';
        else if (!/^https?:\/\//i.test(url)) errors.darSource = 'DAR Source URL must start with http:// or https://';
      } else {
        if (!form.darSourcePdf) errors.darSource = 'Upload a PDF to use as the DAR Source.';
      }
    }

    return { valid: Object.keys(errors).length === 0, errors };
  };

  const validation = useMemo(() => {
    if (!isOpen) return { valid: false, errors: {} as Record<string, string> };
    return validateForm();
  }, [
    isOpen,
    form.documentCode,
    form.documentName,
    form.effectiveDate,
    form.sourceKind,
    form.sourceLinkUrl,
    form.sourcePdf,
    form.darNumber,
    form.darSourceKind,
    form.darSourceLinkUrl,
    form.darSourcePdf,
  ]);

  const canSubmit = validation.valid && !loading;

  const parsedCurrentTags = useMemo(() => parseTags(form.tagsText), [form.tagsText]);
  const currentTagSet = useMemo(() => new Set(parsedCurrentTags.map((t) => t.toLowerCase())), [parsedCurrentTags]);

  const activeTagQuery = useMemo(() => {
    const raw = form.tagsText || '';
    const idx = raw.lastIndexOf(',');
    const part = idx >= 0 ? raw.slice(idx + 1) : raw;
    return part.trim().toLowerCase();
  }, [form.tagsText]);

  const tagSuggestions = useMemo(() => {
    if (!isOpen) return [];
    if (!isTagsFocused) return [];
    const q = activeTagQuery;
    // Show something only after user started typing a tag
    if (!q) return [];
    return existingTags
      .filter((t) => {
        const s = (t || '').trim();
        if (!s) return false;
        if (currentTagSet.has(s.toLowerCase())) return false;
        return s.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [isOpen, isTagsFocused, activeTagQuery, existingTags, currentTagSet]);

  const applyTagSuggestion = (tag: string) => {
    const picked = (tag || '').trim();
    if (!picked) return;
    const raw = form.tagsText || '';
    const idx = raw.lastIndexOf(',');
    const base = idx >= 0 ? raw.slice(0, idx + 1) : '';
    const next = `${base}${base ? ' ' : ''}${picked}, `;
    setForm((p) => ({ ...p, tagsText: next }));
  };

  // IMPORTANT: keep hook order stable (do not return before hooks above run)
  if (!isOpen) return null;

  if (!canEdit) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">You do not have permission to manage documents.</p>
            <Button variant="primary" size="md" className="mt-4" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const scrollToFirstError = (errors: Record<string, string>) => {
    const order: Array<{ key: string; id: string }> = [
      { key: 'documentCode', id: 'docIndex-documentCode' },
      { key: 'documentName', id: 'docIndex-documentName' },
      { key: 'effectiveDate', id: 'docIndex-effectiveDate' },
      { key: 'source', id: 'docIndex-source' },
      { key: 'darSource', id: 'docIndex-darSource' },
    ];
    const first = order.find((o) => Boolean(errors[o.key]));
    if (!first) return;
    const el = document.getElementById(first.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as any).focus?.();
    }
  };

  const uploadPdfTo = async (
    file: File,
    kind: 'doc' | 'dar'
  ): Promise<Extract<DocumentSource, { kind: 'pdf' }>> => {
    const revisionNumber = pad2(form.revisionNumber);
    const safeCode = (form.documentCode || 'document').trim().replace(/[^\w.-]+/g, '_');
    const base = `document_index/${safeCode}/rev-${revisionNumber}`;
    const path =
      kind === 'dar'
        ? `${base}/dar/${Date.now()}_${file.name}`
        : `${base}/${Date.now()}_${file.name}`;
    const meta = await uploadFile(file, path);
    return { kind: 'pdf', storagePath: meta.id, url: meta.url, fileName: meta.name };
  };

  const save = async () => {
    setSaveError(null);
    const result = validateForm();
    if (!result.valid) {
      setFormErrors(result.errors);
      scrollToFirstError(result.errors);
      return;
    }
    setFormErrors({});

    const documentCode = form.documentCode.trim();
    const documentName = form.documentName.trim();
    const revisionNumber = pad2(form.revisionNumber);
    const eff = parseDateInputLocal(form.effectiveDate);

    const source = buildSource();
    const darNumber = form.darNumber.trim();
    const darSource = buildDarSource();

    const input: DocumentIndexItemInput = {
      documentCode,
      type: form.type,
      revisionNumber,
      documentName,
      tags: parseTags(form.tagsText),
      effectiveDate: eff!,
      darNumber: darNumber || undefined,
      source: source!,
      darSource: darNumber ? (darSource as DocumentSource) : undefined,
    };

    setLoading(true);
    try {
      if (mode === 'edit' && initial) {
        const updates: any = {
          ...input,
          // Explicitly clear optional fields when DAR number is removed
          darNumber: darNumber || '',
          darSource: darNumber ? (darSource as DocumentSource) : null,
        };
        await documentIndexService.update(initial.id, updates, userId);
        success('Document updated.');
      } else {
        await documentIndexService.create(input, userId);
        success('Document created.');
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      console.error('[document_index] save failed', e);
      const msg = e?.message || 'Failed to save document.';
      setSaveError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'edit' && initial ? `Edit: ${initial.documentCode}` : 'Create Document';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden p-[3px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">Enter document metadata and sources. Fields marked required must be valid to enable save.</p>
          </div>
          <IconButton variant="secondary" size="md" title="Close" onClick={onClose} disabled={loading}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {saveError && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-800">
              <div className="font-semibold mb-1">Save failed</div>
              <div className="text-xs text-red-700 whitespace-pre-wrap">{saveError}</div>
            </div>
          )}
          {Object.keys(formErrors).length > 0 && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-800">
              <div className="font-semibold mb-1">Please fix the highlighted errors</div>
              <div className="text-xs text-red-700">
                Fields with errors are shown below. The {mode === 'edit' ? 'Save' : 'Create'} button will be enabled once the form is valid.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Code</label>
              <input
                id="docIndex-documentCode"
                className="input w-full"
                value={form.documentCode}
                onChange={(e) => {
                  setForm((p) => ({ ...p, documentCode: e.target.value }));
                  if (formErrors.documentCode) {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.documentCode;
                      return next;
                    });
                  }
                }}
                placeholder="e.g. SCS-QP-01"
              />
              {formErrors.documentCode && <div className="mt-1 text-xs text-red-600">{formErrors.documentCode}</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="input w-full"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as DocumentIndexType }))}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Revision Number</label>
              <input
                className="input w-full"
                value={form.revisionNumber}
                onChange={(e) => setForm((p) => ({ ...p, revisionNumber: e.target.value }))}
                onBlur={() => setForm((p) => ({ ...p, revisionNumber: pad2(p.revisionNumber) }))}
                placeholder="01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                id="docIndex-effectiveDate"
                // `type="date"` is inconsistent across Electron/Windows builds and can become effectively uneditable.
                // Keep a plain text input in YYYY-MM-DD and validate/parse ourselves.
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD (or DD/MM/YYYY)"
                className="input w-full"
                value={form.effectiveDate}
                onChange={(e) => {
                  setForm((p) => ({ ...p, effectiveDate: e.target.value }));
                  if (formErrors.effectiveDate) {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.effectiveDate;
                      return next;
                    });
                  }
                }}
              />
              {formErrors.effectiveDate && <div className="mt-1 text-xs text-red-600">{formErrors.effectiveDate}</div>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
              <input
                id="docIndex-documentName"
                className="input w-full"
                value={form.documentName}
                onChange={(e) => {
                  setForm((p) => ({ ...p, documentName: e.target.value }));
                  if (formErrors.documentName) {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.documentName;
                      return next;
                    });
                  }
                }}
                placeholder="Document name"
              />
              {formErrors.documentName && <div className="mt-1 text-xs text-red-600">{formErrors.documentName}</div>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <div className="relative">
                <input
                  className="input w-full"
                  value={form.tagsText}
                  onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
                  onFocus={() => setIsTagsFocused(true)}
                  onBlur={() => {
                    // Delay so click on suggestion can register
                    window.setTimeout(() => setIsTagsFocused(false), 150);
                  }}
                  placeholder="e.g. QP, ISO17025, Calibration"
                />
                {tagSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                      Existing tags
                    </div>
                    <ul className="max-h-48 overflow-auto">
                      {tagSuggestions.map((t) => (
                        <li key={t}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyTagSuggestion(t)}
                            title={`Add tag: ${t}`}
                          >
                            {t}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-3" id="docIndex-source">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-800">Document Source</div>
            </div>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={form.sourceKind === 'link' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setForm((p) => ({ ...p, sourceKind: 'link' }))}
              >
                Link
              </Button>
              <Button
                type="button"
                variant={form.sourceKind === 'pdf' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setForm((p) => ({ ...p, sourceKind: 'pdf' }))}
              >
                PDF
              </Button>
            </div>
            {form.sourceKind === 'link' ? (
              <input
                className="input w-full"
                value={form.sourceLinkUrl}
                onChange={(e) => {
                  setForm((p) => ({ ...p, sourceLinkUrl: e.target.value }));
                  if (formErrors.source) {
                    setFormErrors((prev) => {
                      const next = { ...prev };
                      delete next.source;
                      return next;
                    });
                  }
                }}
                placeholder="https://..."
              />
            ) : (
              <div className="space-y-2">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setLoading(true);
                      const pdf = await uploadPdfTo(file, 'doc');
                      setForm((p) => ({ ...p, sourcePdf: pdf, sourceKind: 'pdf' }));
                      success('PDF uploaded.');
                      if (formErrors.source) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.source;
                          return next;
                        });
                      }
                    } catch (err: any) {
                      showError(err?.message || 'Failed to upload PDF.');
                    } finally {
                      setLoading(false);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                {form.sourcePdf ? (
                  <div className="text-xs text-gray-600">
                    Uploaded: <span className="font-medium">{form.sourcePdf.fileName}</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Upload a PDF to use as the document source.</div>
                )}
              </div>
            )}
            {formErrors.source && <div className="mt-2 text-xs text-red-600">{formErrors.source}</div>}
          </div>

          <div className="border border-gray-200 rounded-lg p-3" id="docIndex-darSource">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">DAR Number</label>
                <input
                  className="input w-full"
                  value={form.darNumber}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setForm((p) => ({ ...p, darNumber: nextVal }));
                    if (!nextVal.trim() && formErrors.darSource) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.darSource;
                        return next;
                      });
                    }
                  }}
                  placeholder="e.g. 001/26"
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-800">DAR Source</div>
                  <div className="text-xs text-gray-500">{form.darNumber.trim() ? 'Required' : 'Optional'}</div>
                </div>
                <div className="flex gap-2 my-2">
                  <Button
                    type="button"
                    variant={form.darSourceKind === 'link' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setForm((p) => ({ ...p, darSourceKind: 'link' }))}
                    disabled={!form.darNumber.trim()}
                  >
                    Link
                  </Button>
                  <Button
                    type="button"
                    variant={form.darSourceKind === 'pdf' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setForm((p) => ({ ...p, darSourceKind: 'pdf' }))}
                    disabled={!form.darNumber.trim()}
                  >
                    PDF
                  </Button>
                </div>
                {!form.darNumber.trim() ? (
                  <div className="text-xs text-gray-500">Set a DAR Number to enable DAR Source.</div>
                ) : form.darSourceKind === 'link' ? (
                  <input
                    className="input w-full"
                    value={form.darSourceLinkUrl}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, darSourceLinkUrl: e.target.value }));
                      if (formErrors.darSource) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.darSource;
                          return next;
                        });
                      }
                    }}
                    placeholder="https://..."
                  />
                ) : (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setLoading(true);
                          const pdf = await uploadPdfTo(file, 'dar');
                          setForm((p) => ({ ...p, darSourcePdf: pdf, darSourceKind: 'pdf' }));
                          success('DAR PDF uploaded.');
                          if (formErrors.darSource) {
                            setFormErrors((prev) => {
                              const next = { ...prev };
                              delete next.darSource;
                              return next;
                            });
                          }
                        } catch (err: any) {
                          showError(err?.message || 'Failed to upload DAR PDF.');
                        } finally {
                          setLoading(false);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    {form.darSourcePdf ? (
                      <div className="text-xs text-gray-600">
                        Uploaded: <span className="font-medium">{form.darSourcePdf.fileName}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">Upload a PDF to use as the DAR source.</div>
                    )}
                  </div>
                )}
                {formErrors.darSource && <div className="mt-2 text-xs text-red-600">{formErrors.darSource}</div>}
              </div>
            </div>
          </div>

          {!validation.valid && !loading && (
            <p className="text-sm text-gray-500">
              Fill Document Code, Document Name, and Effective Date (at the top of this form) to enable {mode === 'edit' ? 'Save' : 'Create'}.
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" onClick={save} disabled={!canSubmit}>
            {loading
              ? 'Saving…'
              : !validation.valid
                ? mode === 'edit'
                  ? 'Fix errors to save'
                  : 'Fix errors to create'
                : mode === 'edit'
                  ? 'Save Changes'
                  : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

