/**
 * Recorder Templates — list page.
 * Admin-only (route-gated). Create a draft, open the builder, publish, or
 * archive an existing template.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recorderTemplateService } from '../services/recorderTemplateService';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import type { CertificateNumberConfig, RecorderTemplate } from '../types';

const STATUS_STYLES: Record<RecorderTemplate['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-amber-50 text-amber-700',
};

export const RecorderTemplatesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { hasPermission: canEdit } = usePermission('recorderTemplates.edit');
  const { currentUser } = useAuth();

  const [templates, setTemplates] = useState<RecorderTemplate[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<CertificateNumberConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEquipmentTypeId, setNewEquipmentTypeId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [tpls, types] = await Promise.all([
        recorderTemplateService.getAllTemplates(),
        certificateNumberConfigService.getActiveConfigs(),
      ]);
      setTemplates(tpls);
      setEquipmentTypes(types);
    } catch (e: any) {
      showError(e.message || 'Failed to load recorder templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const equipmentTypeName = (id: string) => equipmentTypes.find((t) => t.id === id)?.name || id;

  const openCreate = () => {
    setNewName('');
    setNewEquipmentTypeId(equipmentTypes[0]?.id || '');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { showError('Name is required'); return; }
    if (!newEquipmentTypeId) { showError('Select an equipment type'); return; }

    setSaving(true);
    try {
      const userId = currentUser?.uid || '';
      const id = await recorderTemplateService.createTemplate({
        name: newName.trim(),
        equipmentTypeId: newEquipmentTypeId,
        roundCount: 1,
        defaultRowCount: 5,
        allowRowAdd: true,
        recordNumberFormat: {
          parts: [],
          separator: '-',
          includeYear: true,
          yearDigits: 2,
          numberPadding: 3,
          resetPolicy: 'never',
        },
        sections: [],
        summaryFields: [],
        customFunctions: [],
        createdBy: userId,
        updatedBy: userId,
      });
      success(`"${newName}" created`);
      setShowCreate(false);
      navigate(`/recorder-templates/${id}`);
    } catch (e: any) {
      showError(e.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (template: RecorderTemplate) => {
    if (!window.confirm(`Archive "${template.name}"? This frees its equipment type for a different active template.`)) return;
    setSaving(true);
    try {
      await recorderTemplateService.archiveTemplate(template.id, currentUser?.uid || '');
      success(`"${template.name}" archived`);
      await load();
    } catch (e: any) {
      showError(e.message || 'Failed to archive');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async (template: RecorderTemplate) => {
    if (!window.confirm(`Delete the draft "${template.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await recorderTemplateService.deleteDraftTemplate(template.id);
      success(`"${template.name}" deleted`);
      await load();
    } catch (e: any) {
      showError(e.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recorder Templates</h1>
            <p className="text-sm text-gray-500 mt-1">
              Define how each equipment type is recorded — sections, columns, formulas, and summary fields.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              disabled={loading || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New template
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-500 mb-3">No recorder templates yet</p>
            {canEdit && (
              <button type="button" onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
                Create the first template
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{template.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${STATUS_STYLES[template.status]}`}>
                      {template.status}
                    </span>
                    {template.version > 0 && (
                      <span className="text-xs text-gray-400">v{template.version}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{equipmentTypeName(template.equipmentTypeId)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/recorder-templates/${template.id}`)}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {canEdit ? 'Edit' : 'View'}
                  </button>
                  {canEdit && template.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleArchive(template)}
                      disabled={saving}
                      className="px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                  {canEdit && template.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(template)}
                      disabled={saving}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">New recorder template</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input w-full text-sm"
                  placeholder="e.g. UTM Calibration"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">Equipment type</label>
                <select
                  value={newEquipmentTypeId}
                  onChange={(e) => setNewEquipmentTypeId(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="" disabled>Select equipment type…</option>
                  {equipmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {equipmentTypes.length === 0 && (
                  <p className="text-[10px] text-amber-600">No active equipment types exist yet — create one in Settings first.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleCreate} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
