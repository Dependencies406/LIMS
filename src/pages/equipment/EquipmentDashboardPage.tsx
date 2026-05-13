import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEquipment } from '../../hooks/useEquipment';
import { equipmentService } from '../../services/equipmentService';
import type { EquipmentStatus } from '../../types';
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

export const EquipmentDashboardPage: React.FC = () => {
  const { equipment, loading, error, approveRegistration, rejectRegistration } = useEquipment();
  const { isAdmin } = useAuth();
  const { success, error: showError } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

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

  function exportToXlsx() {
    // Simple CSV download as proxy for xlsx
    const headers = ['ID', 'Name', 'Category', 'Serial No.', 'Location', 'Custodian', 'Status', 'Cal. Due', 'Last Usage'];
    const rows = filtered.map((e) => [
      e.id, e.name, e.category, e.serialNumber, e.location, e.custodian,
      equipmentService.getStatusLabel(e.status), e.nextCalibrationDate || '', '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LAB-FM-QP-05-003_${new Date().toISOString().split('T')[0]}.csv`;
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Equipment Control</h1>
            <p className="text-sm text-gray-500 mt-0.5">LAB-FM-QP-05-003 — Equipment Registry</p>
          </div>
          <Link
            to="/equipment/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <span className="text-base">+</span>
            Register Equipment
          </Link>
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
            {isAdmin && (
              <button
                onClick={exportToXlsx}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Export Registry
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
                  {['Equipment ID', 'Name', 'Category', 'Serial No.', 'Status', 'Custodian', 'Next Cal.', 'Actions'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                      {equipment.length === 0
                        ? 'No equipment registered yet. Click "Register Equipment" to get started.'
                        : 'No equipment matches the current filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((eq) => {
                    const calDue = eq.nextCalibrationDate;
                    const calClass =
                      eq.status === 'overdue'
                        ? 'text-red-600 font-medium'
                        : eq.status === 'due_soon'
                        ? 'text-amber-600 font-medium'
                        : 'text-gray-700';

                    return (
                      <tr key={eq.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary-700">
                          <Link to={`/equipment/${eq.id}`} className="hover:underline">
                            {eq.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate">{eq.name}</td>
                        <td className="px-4 py-3 text-gray-500">{eq.category}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{eq.serialNumber}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={eq.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">
                          {eq.custodianName || eq.custodian}
                        </td>
                        <td className={`px-4 py-3 ${calClass}`}>{formatDate(calDue)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/equipment/${eq.id}`}
                              className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                            >
                              View
                            </Link>
                            <Link
                              to={`/equipment/${eq.id}/usage-log/new`}
                              className="text-gray-500 hover:text-gray-700 text-xs"
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
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {equipment.length} equipment records
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
