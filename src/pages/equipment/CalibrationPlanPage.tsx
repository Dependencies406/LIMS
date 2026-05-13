import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEquipment } from '../../hooks/useEquipment';
import { equipmentService } from '../../services/equipmentService';

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

export const CalibrationPlanPage: React.FC = () => {
  const { equipment, loading } = useEquipment();

  // Only calibration-controlled equipment
  const calEquipment = useMemo(
    () =>
      equipment
        .filter((e) => e.requiresCalibration && e.status !== 'retired')
        .sort((a, b) => {
          const da = a.nextCalibrationDate || '9999';
          const db = b.nextCalibrationDate || '9999';
          return da < db ? -1 : da > db ? 1 : 0;
        }),
    [equipment]
  );

  const overdue = calEquipment.filter((e) => (daysUntil(e.nextCalibrationDate) ?? 999) < 0);
  const dueSoon = calEquipment.filter((e) => {
    const d = daysUntil(e.nextCalibrationDate);
    return d !== null && d >= 0 && d <= 30;
  });
  const upcoming = calEquipment.filter((e) => {
    const d = daysUntil(e.nextCalibrationDate);
    return d !== null && d > 30 && d <= 120;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calibration Plan</h1>
            <p className="text-sm text-gray-500 mt-0.5">LAB-FM-QP-05-007 — All equipment sorted by next due date</p>
          </div>
          <Link to="/equipment" className="text-sm text-primary-600 hover:underline">
            ← Equipment Dashboard
          </Link>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{overdue.length}</p>
            <p className="text-xs text-red-600">Overdue</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{dueSoon.length}</p>
            <p className="text-xs text-amber-600">Due ≤ 30 Days</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{upcoming.length}</p>
            <p className="text-xs text-blue-600">Due in 31–120 Days</p>
          </div>
        </div>

        {/* 4-month plan review alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <strong>Plan Review Reminder:</strong> LAB-FM-QP-05-007 must be reviewed every 4 months (§3.5.2). Upload the current plan via the Cal. Plan tab on each equipment record.
        </div>

        {calEquipment.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
            No calibration-controlled equipment registered.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Equipment ID', 'Name', 'Category', 'Interval', 'Last Cal.', 'Next Cal.', 'Days Left', 'Status', 'Procedure'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calEquipment.map((eq) => {
                    const days = daysUntil(eq.nextCalibrationDate);
                    let daysClass = 'text-gray-700';
                    if (days !== null && days < 0) daysClass = 'text-red-600 font-bold';
                    else if (days !== null && days <= 30) daysClass = 'text-amber-600 font-medium';

                    return (
                      <tr key={eq.id} className={`hover:bg-gray-50 ${days !== null && days < 0 ? 'bg-red-50/30' : days !== null && days <= 30 ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary-700">
                          <Link to={`/equipment/${eq.id}`} className="hover:underline">{eq.id}</Link>
                        </td>
                        <td className="px-4 py-3 text-gray-900 max-w-[180px] truncate">{eq.name}</td>
                        <td className="px-4 py-3 text-gray-500">{eq.category}</td>
                        <td className="px-4 py-3 text-gray-600">{eq.calibrationInterval ? `${eq.calibrationInterval} mo` : '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(eq.lastCalibrationDate)}</td>
                        <td className={`px-4 py-3 ${daysClass}`}>{formatDate(eq.nextCalibrationDate)}</td>
                        <td className={`px-4 py-3 ${daysClass}`}>
                          {days === null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${equipmentService.getStatusColor(eq.status)}`}>
                            {equipmentService.getStatusLabel(eq.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{eq.calibrationProcedure || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
