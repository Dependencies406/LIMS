import React, { useEffect, useMemo, useState } from 'react';
import type { DocumentIndexItem, DocumentIndexType, DocumentSource, PermissionAction } from '../types';
import { documentIndexService } from '../services/documentIndexService';
import { auth } from '../services/firebase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, LoadingSpinner } from '../components/common';
import { DocumentIndexManagerModal } from '../components/DocumentIndexManagerModal';
import { TemplateBasedDocumentsPdfGenerator } from '../components/TemplateBasedDocumentsPdfGenerator';
import { formatDateForDisplay } from '../utils/dateDisplayFormatter';
import { exportDocumentIndexToExcel } from '../services/documentIndexExcelExportService';

const TYPES: DocumentIndexType[] = [
  'Quality Manual',
  'Quality Procedure',
  'Work Instruction',
  'Calibration Procedure',
  'Testing Procedure',
  'Form',
  'Support Document',
];

const openSource = (source: DocumentSource | undefined) => {
  if (!source) return;
  if (source.kind === 'link') {
    window.open(source.url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.open(source.url, '_blank', 'noopener,noreferrer');
};

export const DocumentIndexPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const { isAdmin, currentUser } = useAuth();
  const { hasPermission: canManage } = usePermission('documentIndex.manage' as PermissionAction);
  const canManageDocs = isAdmin || canManage;

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState<DocumentIndexItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DocumentIndexType>('all');
  const [showManager, setShowManager] = useState(false);
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

  useEffect(() => {
    if (!currentUser) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    setLoading(true);

    (async () => {
      try {
        // Ensure an auth token is available before starting the Firestore listen.
        await auth.currentUser?.getIdToken();
        if (cancelled) return;

        unsub = documentIndexService.subscribe(
          (next) => {
            setItems(next);
            setLoading(false);
          },
          (err) => {
            console.error('[document_index] subscribe failed', err);
            showError('Failed to load documents index.');
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('[document_index] auth token fetch failed', err);
        showError('Failed to load documents index.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [currentUser, showError]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const matchesType = typeFilter === 'all' || it.type === typeFilter;
      if (!matchesType) return false;
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

  const sorted = useMemo(() => {
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
        case 'documentCode':
          cmp = (a.documentCode || '').localeCompare(b.documentCode || '', undefined, { sensitivity: 'base' });
          break;
        case 'type':
          cmp = (a.type || '').localeCompare(b.type || '', undefined, { sensitivity: 'base' });
          break;
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
        case 'documentName':
          cmp = (a.documentName || '').localeCompare(b.documentName || '', undefined, { sensitivity: 'base' });
          break;
        case 'tags':
          cmp = tagsSortKey(a).localeCompare(tagsSortKey(b), undefined, { sensitivity: 'base' });
          break;
        case 'effectiveDate':
          cmp = effectiveDateSortKey(a) - effectiveDateSortKey(b);
          break;
        case 'darNumber':
          cmp = (a.darNumber || '').localeCompare(b.darNumber || '', undefined, { sensitivity: 'base' });
          break;
        default:
          cmp = 0;
      }

      if (cmp === 0) {
        cmp = (a.documentCode || '').localeCompare(b.documentCode || '', undefined, { sensitivity: 'base' });
      }

      return cmp * dirFactor;
    };

    return [...filtered].sort(comparator);
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(0);
  }, [search, typeFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visibleRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

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
    <div className="p-6 print-documents-page">
      <div className="mb-6 flex items-center justify-end gap-4">
        <div className="flex items-center gap-2 print-hidden">
          <TemplateBasedDocumentsPdfGenerator
            trigger={
              <Button variant="secondary">
                Print
              </Button>
            }
            documentIndexItems={sorted}
          />
          <Button
            variant="secondary"
            disabled={exporting || loading || sorted.length === 0}
            onClick={async () => {
              try {
                setExporting(true);
                await exportDocumentIndexToExcel(sorted);
                success('Documents exported to Excel.');
              } catch (e) {
                console.error('[document_index] export to excel failed', e);
                showError('Failed to export documents to Excel.');
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </Button>
          {canManageDocs && (
            <Button variant="secondary" onClick={() => setShowManager(true)}>
              Manage
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 mb-6 print-hidden">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, name, tags, effective date..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter((e.target.value as any) || 'all')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500">No documents found</p>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden print-documents-table">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('documentCode')}
                      title="Sort by Document Code"
                    >
                      Document Code{sortKey === 'documentCode' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('type')}
                      title="Sort by Type"
                    >
                      Type{sortKey === 'type' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('revisionNumber')}
                      title="Sort by Revision"
                    >
                      Revision{sortKey === 'revisionNumber' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('documentName')}
                      title="Sort by Document Name"
                    >
                      Document Name{sortKey === 'documentName' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('tags')}
                      title="Sort by Tags"
                    >
                      Tag(s){sortKey === 'tags' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('effectiveDate')}
                      title="Sort by Effective Date"
                    >
                      Effective Date{sortKey === 'effectiveDate' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleHeaderSort('darNumber')}
                      title="Sort by DAR Number"
                    >
                      DAR Number{sortKey === 'darNumber' ? <SortIndicator dir={sortDir} /> : null}
                    </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visibleRows.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50 transition-colors">
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer"
                      onClick={() => openSource(it.source)}
                      title="Open document"
                    >
                      {it.documentCode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer" onClick={() => openSource(it.source)}>
                      {it.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer" onClick={() => openSource(it.source)}>
                      {it.revisionNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 cursor-pointer" onClick={() => openSource(it.source)}>
                      {it.documentName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 cursor-pointer" onClick={() => openSource(it.source)}>
                      <div className="flex flex-wrap gap-1">
                        {(it.tags || []).length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          it.tags.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200">
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer" onClick={() => openSource(it.source)}>
                      {formatDateForDisplay(it.effectiveDate)}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-sm ${
                        it.darNumber && it.darSource ? 'text-gray-700 cursor-pointer' : 'text-gray-400'
                      }`}
                      onClick={() => {
                        if (it.darNumber && it.darSource) openSource(it.darSource);
                      }}
                      title={it.darNumber && it.darSource ? 'Open DAR document' : undefined}
                    >
                      {typeof it.darNumber === 'string' ? it.darNumber : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length > 0 ? (
            <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-gray-200 bg-white print-hidden">
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
      )}

      {showManager && canManageDocs && (
        <DocumentIndexManagerModal isOpen={showManager} onClose={() => setShowManager(false)} />
      )}
    </div>
  );
};

