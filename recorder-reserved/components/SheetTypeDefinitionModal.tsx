import React, { useEffect, useState } from 'react';
import type { SheetFieldDef, SheetFieldType, SheetSeriesDef, SheetTypeDefinition } from '../types';
import { FORCE_SHEET_TYPE } from '../modules/data-recorder/sheetLogic';
import { PlusIcon, TrashIcon, CheckIcon, BarChartIcon } from './common';

interface SheetTypeDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  definitions: SheetTypeDefinition[];
  onSave: (definition: SheetTypeDefinition) => Promise<void>;
}

const FIELD_TYPES: SheetFieldType[] = ['text', 'number', 'select', 'date'];

function blankDefinition(): SheetTypeDefinition {
  return {
    id: '',
    displayName: '',
    headerFields: [],
    series: [],
    envRounds: 0,
    schemaVersion: 1,
  };
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const SheetTypeDefinitionModal: React.FC<SheetTypeDefinitionModalProps> = ({
  isOpen,
  onClose,
  definitions,
  onSave,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SheetTypeDefinition>(blankDefinition());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (definitions.length > 0 && !selectedId) {
      const first = definitions.find((d) => d.id === FORCE_SHEET_TYPE) ?? definitions[0];
      setSelectedId(first.id);
      setDraft({ ...first });
    }
  }, [isOpen, definitions, selectedId]);

  if (!isOpen) return null;

  const isNew = selectedId === null;
  const isForce = draft.id === FORCE_SHEET_TYPE;

  const selectDefinition = (def: SheetTypeDefinition) => {
    setSelectedId(def.id);
    setDraft({ ...def });
    setError(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(blankDefinition());
    setError(null);
  };

  const addHeaderField = () => {
    setDraft((d) => ({
      ...d,
      headerFields: [...d.headerFields, { key: '', label: '', type: 'text' }],
    }));
  };
  const updateHeaderField = (index: number, patch: Partial<SheetFieldDef>) => {
    setDraft((d) => ({
      ...d,
      headerFields: d.headerFields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };
  const removeHeaderField = (index: number) => {
    setDraft((d) => ({ ...d, headerFields: d.headerFields.filter((_, i) => i !== index) }));
  };

  const addSeries = () => {
    setDraft((d) => ({
      ...d,
      series: [...d.series, { key: '', label: '', direction: 'increasing', order: d.series.length }],
    }));
  };
  const updateSeries = (index: number, patch: Partial<SheetSeriesDef>) => {
    setDraft((d) => ({
      ...d,
      series: d.series.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };
  const removeSeries = (index: number) => {
    setDraft((d) => ({
      ...d,
      series: d.series.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })),
    }));
  };

  const validate = (): string | null => {
    if (!draft.id.trim()) return 'Sheet type ID is required.';
    if (!draft.displayName.trim()) return 'Display name is required.';
    if (isNew && definitions.some((d) => d.id === draft.id)) return `Sheet type '${draft.id}' already exists.`;
    if (draft.headerFields.some((f) => !f.key.trim() || !f.label.trim())) {
      return 'Every header field needs a key and a label.';
    }
    if (draft.series.some((s) => !s.key.trim() || !s.label.trim())) {
      return 'Every series needs a key and a label.';
    }
    if (draft.envRounds < 0) return 'Env rounds cannot be negative.';
    return null;
  };

  const handleSave = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
      setSelectedId(draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-4xl max-h-[min(90vh,900px)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChartIcon className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Sheet Types</h2>
              <p className="text-xs text-gray-400 mt-0.5">Header fields, series layout, and env rounds per analysis type</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* ── Sheet type list ─────────────────────────────────────────── */}
          <div className="w-48 flex-shrink-0 border-r border-gray-100 overflow-y-auto p-2 space-y-1">
            {definitions.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => selectDefinition(def)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  selectedId === def.id ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="truncate">{def.displayName || def.id}</div>
                <div className="truncate text-[10px] text-gray-400 font-mono">{def.id}</div>
              </button>
            ))}
            <button
              type="button"
              onClick={startNew}
              className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                isNew ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New sheet type
            </button>
          </div>

          {/* ── Editor ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Sheet type ID</span>
                <input
                  type="text"
                  value={draft.id}
                  disabled={!isNew}
                  onChange={(e) => setDraft((d) => ({ ...d, id: slugify(e.target.value) }))}
                  placeholder="e.g. torque-iso6789"
                  className="input w-full mt-1 font-mono text-xs disabled:bg-gray-50 disabled:text-gray-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Display name</span>
                <input
                  type="text"
                  value={draft.displayName}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                  placeholder="e.g. Torque"
                  className="input w-full mt-1 text-xs"
                />
              </label>
            </div>

            <label className="block max-w-xs">
              <span className="text-xs font-medium text-gray-700">Environment rounds</span>
              <input
                type="number"
                min={0}
                value={draft.envRounds}
                onChange={(e) => setDraft((d) => ({ ...d, envRounds: Number(e.target.value) || 0 }))}
                className="input w-full mt-1 text-xs"
              />
            </label>

            {/* ── Header fields ────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Header fields</p>
                <button type="button" onClick={addHeaderField} className="flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-800">
                  <PlusIcon className="w-3.5 h-3.5" /> Add field
                </button>
              </div>
              <div className="space-y-2">
                {draft.headerFields.map((field, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-2.5">
                    <label className="flex flex-col gap-0.5 w-32">
                      <span className="text-[10px] text-gray-500">Key</span>
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) => updateHeaderField(i, { key: e.target.value })}
                        placeholder="e.g. torqueRange"
                        className="input w-full text-xs font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                      <span className="text-[10px] text-gray-500">Label</span>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateHeaderField(i, { label: e.target.value })}
                        placeholder="e.g. Torque Range"
                        className="input w-full text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 w-28">
                      <span className="text-[10px] text-gray-500">Type</span>
                      <select
                        value={field.type}
                        onChange={(e) => updateHeaderField(i, { type: e.target.value as SheetFieldType })}
                        className="input w-full text-xs"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    {field.type === 'select' && (
                      <label className="flex flex-col gap-0.5 w-full sm:w-48">
                        <span className="text-[10px] text-gray-500">Options (comma-separated)</span>
                        <input
                          type="text"
                          value={(field.options ?? []).join(', ')}
                          onChange={(e) => updateHeaderField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                          placeholder="option1, option2"
                          className="input w-full text-xs"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 pb-2">
                      <input
                        type="checkbox"
                        checked={!!field.required}
                        onChange={(e) => updateHeaderField(i, { required: e.target.checked })}
                      />
                      required
                    </label>
                    <button type="button" onClick={() => removeHeaderField(i)} className="text-gray-400 hover:text-red-500 pb-2 ml-auto">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {draft.headerFields.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No header fields yet.</p>
                )}
              </div>
            </div>

            {/* ── Series ───────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Series (measurement columns)</p>
                <button type="button" onClick={addSeries} className="flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-800">
                  <PlusIcon className="w-3.5 h-3.5" /> Add series
                </button>
              </div>
              <div className="space-y-2">
                {draft.series.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-2.5">
                    <label className="flex flex-col gap-0.5 w-32">
                      <span className="text-[10px] text-gray-500">Key</span>
                      <input
                        type="text"
                        value={s.key}
                        onChange={(e) => updateSeries(i, { key: e.target.value })}
                        placeholder="e.g. inc1"
                        className="input w-full text-xs font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                      <span className="text-[10px] text-gray-500">Label</span>
                      <input
                        type="text"
                        value={s.label}
                        onChange={(e) => updateSeries(i, { label: e.target.value })}
                        placeholder="e.g. Increasing 1"
                        className="input w-full text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 w-32">
                      <span className="text-[10px] text-gray-500">Direction</span>
                      <select
                        value={s.direction}
                        onChange={(e) => updateSeries(i, { direction: e.target.value as SheetSeriesDef['direction'] })}
                        className="input w-full text-xs"
                      >
                        <option value="increasing">increasing</option>
                        <option value="decreasing">decreasing</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => removeSeries(i)} className="text-gray-400 hover:text-red-500 pb-2 ml-auto">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {draft.series.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No series yet.</p>
                )}
              </div>
            </div>

            {isForce && (
              <p className="text-[11px] text-gray-400 italic">
                This is the built-in force / ISO 7500-1 sheet type. Its data-entry grid and header form use
                specialized components, not the generic renderer — editing here only affects future sheet types
                that reuse pieces of this shape.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
