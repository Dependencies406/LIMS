import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEquipmentDetail } from '../../hooks/useEquipment';

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function Tick({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="text-green-600 font-medium">✓</span>
  ) : (
    <span className="text-red-600 font-medium">✗</span>
  );
}

export const UsageLogHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { equipment, usageLogs, loading } = useEquipmentDetail(id);

  const [filterResult, setFilterResult] = useState<'all' | 'pass' | 'fail'>('all');
  const [filterCondition, setFilterCondition] = useState<'all' | 'normal' | 'abnormal'>('all');
  const [searchOperator, setSearchOperator] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    let logs = usageLogs;
    if (filterResult !== 'all') logs = logs.filter((l) => l.overallResult === filterResult);
    if (filterCondition !== 'all') logs = logs.filter((l) => l.equipmentCondition === filterCondition);
    if (searchOperator) {
      const s = searchOperator.toLowerCase();
      logs = logs.filter((l) => l.operatorName.toLowerCase().includes(s) || l.operator.toLowerCase().includes(s));
    }
    if (dateFrom) logs = logs.filter((l) => l.date >= dateFrom);
    if (dateTo) logs = logs.filter((l) => l.date <= dateTo);
    return logs;
  }, [usageLogs, filterResult, filterCondition, searchOperator, dateFrom, dateTo]);

  const passCount = filtered.filter((l) => l.overallResult === 'pass').length;
  const failCount = filtered.filter((l) => l.overallResult === 'fail').length;
  const passRate = filtered.length ? Math.round((passCount / filtered.length) * 100) : 0;
  const lastFail = filtered.find((l) => l.overallResult === 'fail');

  function exportCsv() {
    const headers = ['Date', 'Operator', 'Visual', 'Functional', 'Cal.Docs', 'Ref.Values', 'Condition', 'Overall', 'Notes'];
    const rows = filtered.map((l) => [
      l.date, l.operatorName, l.visualInspection, l.functionalCheck,
      l.documentCheck, l.refValuesVerified ? 'verified' : 'n/a',
      l.equipmentCondition, l.overallResult, l.notes || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UsageLog_${id}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/equipment/${id}`)} className="text-gray-400 hover:text-gray-600 text-sm">
              ← {id}
            </button>
            <span className="text-gray-300">/</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Usage Log History</h1>
              <p className="text-sm text-gray-500 mt-0.5">{equipment?.name} — LAB-FM-QP-05-005 monitoring view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              Export
            </button>
            <Link
              to={`/equipment/${id}/usage-log/new`}
              className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
            >
              + Add Log
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Aggregate Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-800">{filtered.length}</p>
            <p className="text-xs text-gray-500">Total Sessions</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {passRate}%
            </p>
            <p className="text-xs text-gray-500">Pass Rate</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{lastFail ? formatDate(lastFail.date) : '—'}</p>
            <p className="text-xs text-gray-500">Last FAIL</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Operator…"
              value={searchOperator}
              onChange={(e) => setSearchOperator(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Results</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Conditions</option>
              <option value="normal">Normal</option>
              <option value="abnormal">Abnormal</option>
            </select>
            <div className="flex items-center gap-1 col-span-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Operator', 'Visual', 'Functional', 'Cal.Docs', 'Ref.', 'Condition', 'Overall', 'Notes'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No usage log entries found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id} className={`hover:bg-gray-50 ${log.overallResult === 'fail' ? 'bg-red-50/40' : ''}`}>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-[140px] truncate">{log.operatorName || log.operator}</td>
                      <td className="px-3 py-3 text-center"><Tick pass={log.visualInspection === 'pass'} /></td>
                      <td className="px-3 py-3 text-center"><Tick pass={log.functionalCheck === 'pass'} /></td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium ${log.documentCheck === 'valid' ? 'text-green-600' : log.documentCheck === 'expired' ? 'text-red-600' : 'text-gray-400'}`}>
                          {log.documentCheck === 'valid' ? 'Valid' : log.documentCheck === 'expired' ? 'Expired' : 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-400">
                        {log.refValuesVerified !== undefined ? (log.refValuesVerified ? '✓' : '—') : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium ${log.equipmentCondition === 'normal' ? 'text-green-600' : 'text-red-600'}`}>
                          {log.equipmentCondition === 'normal' ? 'Normal' : 'Abnormal'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${log.overallResult === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {log.overallResult.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 max-w-[200px] truncate" title={log.notes}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} entries · {passCount} pass · {failCount} fail
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
