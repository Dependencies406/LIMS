import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEquipment } from '../../hooks/useEquipment';
import { equipmentControlService as equipmentService } from '../../services/equipmentControlService';
import type { EquipmentRecord, EquipmentStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${equipmentService.getStatusColor(status)}`}>
      {equipmentService.getStatusLabel(status)}
    </span>
  );
}

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

type SortKey = 'id' | 'name' | 'capacity' | 'category' | 'serialNumber' | 'status' | 'custodianName' | 'nextCalibrationDate';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) {
    return (
      <span className="ml-1 text-gray-400 text-[10px]">↕</span>
    );
  }
  return (
    <span className="ml-1 text-primary-600 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>
  );
}

export const EquipmentDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { equipment, loading, error, approveRegistration, rejectRegistration } = useEquipment();
  const { isAdmin } = useAuth();
  const { success, error: showError } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback((col: SortKey) => {
    setSortKey((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return col;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  // Summary card counts
  const total = equipment.length;
  const dueSoon = equipment.filter((e) => e.status === 'due_soon').length;
  const overdue = equipment.filter((e) => e.status === 'overdue').length;
  const outOfService = equipment.filter((e) => e.status === 'out_of_service').length;
  const pending = equipment.filter((e) => e.status === 'pending').length;

  // Unique categories for filter
  const categories = useMemo(
    () => Array.from(new Set(equipment.map((e) => e.category))).sort(),
    [equipment]
  );

  const filtered = useMemo(
    () => equipmentService.filterEquipment(equipment, { search, status: statusFilter, category: categoryFilter }),
    [equipment, search, statusFilter, categoryFilter]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string = '';
      let bv: string = '';
      if (sortKey === 'custodianName') {
        av = a.custodianName || a.custodian || '';
        bv = b.custodianName || b.custodian || '';
      } else if (sortKey === 'nextCalibrationDate') {
        av = a.nextCalibrationDate || '';
        bv = b.nextCalibrationDate || '';
      } else {
        av = String((a as unknown as Record<string, unknown>)[sortKey] ?? '');
        bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? '');
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  async function handleApprove(id: string) {
    try {
      await approveRegistration(id);
      success(`Equipment ${id} approved and set to active`);
    } catch (err: unknown) {
      showError((err as Error).message || 'Approval failed');
    }
  }

  async function handleReject(id: string) {
    if (!window.confirm(`Reject and delete registration for ${id}?`)) return;
    try {
      await rejectRegistration(id);
      success(`Registration ${id} rejected`);
    } catch (err: unknown) {
      showError((err as Error).message || 'Rejection failed');
    }
  }

  function exportCSV() {
    const headers = ['ID', 'Name', 'Capacity', 'Category', 'Serial No.', 'Location', 'Custodian', 'Status', 'Last Cal.', 'Next Cal.'];
    const rows = sorted.map((e) => [
      e.id, e.name, e.capacity || '', e.category, e.serialNumber, e.location,
      e.custodianName || e.custodian,
      equipmentService.getStatusLabel(e.status),
      e.lastCalibrationDate || '', e.nextCalibrationDate || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LAB-FM-QP-05-003_Register_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function printRegister() {
    try {
      const { generateEquipmentRegisterBytes } = await import('../../services/equipmentExportService');
      const bytes = await generateEquipmentRegisterBytes(sorted);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      showError('Failed to generate register PDF');
      console.error(err);
    }
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Equipment Control</h1>
            <p className="text-sm text-gray-500 mt-0.5">LAB-FM-QP-05-003 — Equipment Registry</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/equipment/calibration-plan"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Calibration Plan
            </Link>
            <Link
              to="/equipment/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <span className="text-base">+</span>
              Register Equipment
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Status Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Equipment', value: total, color: 'text-gray-800', bg: 'bg-white' },
            { label: 'Pending Approval', value: pending, color: 'text-gray-600', bg: 'bg-gray-50' },
            { label: 'Due Soon (≤30d)', value: dueSoon, color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'Overdue', value: overdue, color: 'text-red-700', bg: 'bg-red-50' },
            { label: 'Out of Service', value: outOfService, color: 'text-red-700', bg: 'bg-red-50' },
          ].map((card) => (
            <div key={card.label} className={`${card.bg} rounded-xl border border-gray-200 p-4 shadow-sm`}>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search ID, name, serial…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="due_soon">Due Soon</option>
              <option value="overdue">Overdue</option>
              <option value="calibration">In Calibration</option>
              <option value="out_of_service">Out of Service</option>
              <option value="pending">Pending Approval</option>
              <option value="retired">Retired</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              Export CSV
            </button>
            {isAdmin && (
              <button
                onClick={printRegister}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Register
              </button>
            )}
          </div>
        </div>

        {/* Registry Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {(
                    [
                      { label: 'Equipment ID', key: 'id' },
                      { label: 'Name',         key: 'name' },
                      { label: 'Capacity',     key: 'capacity' },
                      { label: 'Category',     key: 'category' },
                      { label: 'Serial No.',   key: 'serialNumber' },
                      { label: 'Status',       key: 'status' },
                      { label: 'Custodian',    key: 'custodianName' },
                      { label: 'Next Cal.',    key: 'nextCalibrationDate' },
                    ] as { label: string; key: SortKey }[]
                  ).map(({ label, key }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    >
                      {label}
                      <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                      {equipment.length === 0
                        ? 'No equipment registered yet. Click "Register Equipment" to get started.'
                        : 'No equipment matches the current filters.'}
                    </td>
                  </tr>
                ) : (
                  sorted.map((eq) => {
                    const calDue = eq.nextCalibrationDate;
                    const calClass =
                      eq.status === 'overdue'
                        ? 'text-red-600 font-medium'
                        : eq.status === 'due_soon'
                        ? 'text-amber-600 font-medium'
                        : 'text-gray-700';

                    return (
                      <tr
                        key={eq.id}
                        onClick={() => navigate(`/equipment/${eq.id}`)}
                        className="hover:bg-primary-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary-700">
                          {eq.id}
                        </td>
                        <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate">{eq.name}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{eq.capacity || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{eq.category}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{eq.serialNumber}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={eq.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">
                          {eq.custodianName || eq.custodian}
                        </td>
                        <td className={`px-4 py-3 ${calClass}`}>{formatDate(calDue)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/equipment/${eq.id}/usage-log/new`}
                              className="text-gray-500 hover:text-gray-700 text-xs whitespace-nowrap"
                            >
                              + Log
                            </Link>
                            {isAdmin && eq.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(eq.id)}
                                  className="text-green-600 hover:text-green-800 text-xs font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(eq.id)}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {sorted.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Showing {sorted.length} of {equipment.length} equipment records
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
