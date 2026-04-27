import React, { useEffect, useMemo, useState } from 'react';
import type { DocumentIndexItem, DocumentIndexType } from '../types';
import { documentIndexService } from '../services/documentIndexService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { DocumentIndexEditorModal } from './DocumentIndexEditorModal';
import { Button } from './common/Button';
import { IconButton } from './common/IconButton';
import { formatDateForDisplay } from '../utils/dateDisplayFormatter';

interface DocumentIndexManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentIndexManagerModal: React.FC<DocumentIndexManagerModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, isAdmin } = useAuth();
  const { hasPermission: canManage } = usePermission('documentIndex.manage');
  const { success, error: showError } = useToast();

  const TYPES: DocumentIndexType[] = [
    'Quality Manual',
    'Quality Procedure',
    'Work Instruction',
    'Calibration Procedure',
    'Testing Procedure',
    'Form',
    'Support Document',
  ];

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DocumentIndexItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DocumentIndexType>('all');
  const [confirmDelete, setConfirmDelete] = useState<DocumentIndexItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorItem, setEditorItem] = useState<DocumentIndexItem | null>(null);
  const [sortKey, setSortKey] = useState<
    'documentCode' | 'type' | 'revisionNumber' | 'documentName' | 'tags' | 'effectiveDate' | 'darNumber'
  >('documentCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(15);

  const SortIndicator: React.FC<{ dir: 'asc' | 'desc' }> = ({ dir }) => (
    <svg
      className="inline-block ml-1 text-gray-400"
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {dir === 'asc' ? (
        <path d="M10 4L3 11h4v6h6v-6h4L10 4z" />
      ) : (
        <path d="M10 16l7-7h-4V3H7v6H3l7 7z" />
      )}
    </svg>
  );

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      for (const t of it.tags || []) {
        const s = (t || '').trim();
        if (s) set.add(s);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    documentIndexService
      .list()
      .then((list) => setItems(list))
      .catch(() => showError('Failed to load documents index.'))
      .finally(() => setLoading(false));
  }, [isOpen, showError]);

  const canEdit = isAdmin || canManage;
  if (!isOpen) return null;

  if (!canEdit) {
    return (
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">You do not have permission to manage documents.</p>
            <Button variant="primary" size="md" className="mt-4" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const refresh = async () => {
    const refreshed = await documentIndexService.list();
    setItems(refreshed);
  };

  const startCreate = () => {
    setEditorMode('create');
    setEditorItem(null);
    setEditorOpen(true);
  };

  const startEdit = (it: DocumentIndexItem) => {
    setEditorMode('edit');
    setEditorItem(it);
    setEditorOpen(true);
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        it.documentCode,
        it.documentName,
        it.effectiveDate ? formatDateForDisplay(it.effectiveDate) : '',
        ...(it.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, typeFilter]);

  const sortedItems = useMemo(() => {
    const dirFactor = sortDir === 'asc' ? 1 : -1;

    const tagsSortKey = (it: DocumentIndexItem) => {
      const tags = (it.tags || []).slice();
      tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return tags.join(',');
    };

    const effectiveDateSortKey = (it: DocumentIndexItem) => {
      if (!it.effectiveDate) return 0;
      const t = new Date(it.effectiveDate as any).getTime();
      return Number.isNaN(t) ? 0 : t;
    };

    const comparator = (a: DocumentIndexItem, b: DocumentIndexItem) => {
      let cmp = 0;

      switch (sortKey) {
        case 'documentCode': {
          cmp = (a.documentCode || '').localeCompare(b.documentCode || '', undefined, { sensitivity: 'base' });
          break;
        }
        case 'type': {
          cmp = (a.type || '').localeCompare(b.type || '', undefined, { sensitivity: 'base' });
          break;
        }
        case 'revisionNumber': {
          const an = parseInt(a.revisionNumber || '', 10);
          const bn = parseInt(b.revisionNumber || '', 10);
          if (!Number.isNaN(an) && !Number.isNaN(bn)) {
            cmp = an - bn;
          } else {
            cmp = (a.revisionNumber || '').localeCompare(b.revisionNumber || '', undefined, { sensitivity: 'base' });
          }
          break;
        }
        case 'documentName': {
          cmp = (a.documentName || '').localeCompare(b.documentName || '', undefined, { sensitivity: 'base' });
          break;
        }
        case 'tags': {
          cmp = tagsSortKey(a).localeCompare(tagsSortKey(b), undefined, { sensitivity: 'base' });
          break;
        }
        case 'effectiveDate': {
          cmp = effectiveDateSortKey(a) - effectiveDateSortKey(b);
          break;
        }
        case 'darNumber': {
          cmp = (a.darNumber || '').localeCompare(b.darNumber || '', undefined, { sensitivity: 'base' });
          break;
        }
        default: {
          cmp = 0;
        }
      }

      // Tie-breaker for deterministic ordering.
      if (cmp === 0) {
        cmp = (a.documentCode || '').localeCompare(b.documentCode || '', undefined, { sensitivity: 'base' });
      }

      return cmp * dirFactor;
    };

    return [...filteredItems].sort(comparator);
  }, [filteredItems, sortKey, sortDir]);

  useEffect(() => {
    setPage(0);
  }, [search, typeFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const visibleItems = sortedItems.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    const maxPage = Math.max(0, totalPages - 1);
    setPage((p) => Math.min(p, maxPage));
  }, [totalPages]);

  const handleHeaderSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content !w-[93vw] !max-w-[120rem] overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Documents Index</h2>
              <p className="text-sm text-gray-500">Create, edit, delete documents and DAR sources.</p>
            </div>
            <div className="flex items-center gap-2">
              <IconButton
                variant="secondary"
                size="md"
                title="New Document"
                onClick={startCreate}
                disabled={loading}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </IconButton>
              <IconButton variant="secondary" size="md" title="Close" onClick={onClose}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
            </div>
          </div>

          {loading && (
            <div className="mb-4 text-sm text-gray-500">Loading…</div>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, tags, effective date..."
                className="input flex-1"
              />
              {search.trim() && (
                <IconButton
                  variant="secondary"
                  size="md"
                  title="Clear search"
                  onClick={() => setSearch('')}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter((e.target.value as any) || 'all')}
                className="input"
              >
                <option value="all">All Types</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="font-semibold text-gray-800">Documents</div>
              <div className="text-xs text-gray-500">{filteredItems.length} item(s)</div>
            </div>
            <div className="max-h-[65vh] overflow-y-auto overflow-x-hidden">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No documents yet.</div>
              ) : (
                <table className="w-full table-fixed min-w-0 text-sm">
                  <thead className="bg-white sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left px-4 py-3 w-[16%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('documentCode')}
                        title="Sort by Code"
                      >
                        Code{sortKey === 'documentCode' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[12%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('type')}
                        title="Sort by Type"
                      >
                        Type{sortKey === 'type' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[6%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('revisionNumber')}
                        title="Sort by Revision"
                      >
                        Rev{sortKey === 'revisionNumber' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[28%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('documentName')}
                        title="Sort by Name"
                      >
                        Name{sortKey === 'documentName' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[16%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('tags')}
                        title="Sort by Tags"
                      >
                        Tags{sortKey === 'tags' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[10%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('effectiveDate')}
                        title="Sort by Effective Date"
                      >
                        Effective Date{sortKey === 'effectiveDate' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th
                        className="text-left px-4 py-3 w-[8%] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('darNumber')}
                        title="Sort by DAR"
                      >
                        DAR{sortKey === 'darNumber' ? <SortIndicator dir={sortDir} /> : null}
                      </th>
                      <th className="text-right px-2 py-3 w-[4%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleItems.map((it) => (
                      <tr key={it.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap truncate">{it.documentCode}</td>
                        <td className="px-4 py-3 text-gray-700">{it.type}</td>
                        <td className="px-4 py-3 text-gray-700">{it.revisionNumber}</td>
                        <td className="px-4 py-3 text-gray-700 min-w-0 whitespace-nowrap truncate">{it.documentName}</td>
                        <td className="px-4 py-3 text-gray-700 min-w-0 overflow-hidden">
                          {(it.tags || []).length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 overflow-hidden">
                              {it.tags.slice(0, 4).map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200 max-w-[8rem] truncate overflow-hidden whitespace-nowrap"
                                >
                                  {t}
                                </span>
                              ))}
                              {(it.tags || []).length > 4 && (
                                <span className="text-xs text-gray-500">+{(it.tags || []).length - 4}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {it.effectiveDate ? formatDateForDisplay(it.effectiveDate) : ''}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{it.darNumber || '—'}</td>
                        <td className="px-2 py-3 min-w-0">
                          <div className="flex items-center justify-end gap-2">
                            <IconButton variant="secondary" size="sm" title="Edit" onClick={() => startEdit(it)}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </IconButton>
                            <IconButton variant="danger" size="sm" title="Delete" onClick={() => setConfirmDelete(it)}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {filteredItems.length > 0 ? (
              <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-gray-200 bg-white">
                <div className="text-xs text-gray-500">
                  Page {page + 1} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page <= 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {confirmDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete document?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will remove <span className="font-medium">{confirmDelete.documentCode}</span> from the index.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="md" onClick={() => setConfirmDelete(null)} disabled={loading}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await documentIndexService.delete(confirmDelete.id);
                      await refresh();
                      success('Document deleted.');
                    } catch (e: any) {
                      showError(e?.message || 'Failed to delete document.');
                    } finally {
                      setLoading(false);
                      setConfirmDelete(null);
                    }
                  }}
                  disabled={loading}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        <DocumentIndexEditorModal
          isOpen={editorOpen}
          mode={editorMode}
          initial={editorItem}
          onClose={() => setEditorOpen(false)}
          onSaved={refresh}
          existingTags={existingTags}
        />
      </div>
    </div>
  );
};

