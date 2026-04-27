import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { 
  loadModelList, 
  addModelItem, 
  updateModelItem, 
  deleteModelItem,
  type ModelListItem 
} from '../services/modelListService';

interface ModelListSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export const ModelListSettingsModal: React.FC<ModelListSettingsModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
}) => {
  const { isAdmin: _isAdmin } = useAuth();
  const { success, error: showError } = useToast();
  const [modelList, setModelList] = useState<ModelListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Load model list when modal opens
  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen]);

  const loadList = async () => {
    setLoading(true);
    try {
      const items = await loadModelList();
      setModelList(items);
    } catch (error) {
      console.error('Error loading model list:', error);
      showError('Failed to load model list');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newItemValue.trim()) {
      showError('Model name cannot be empty');
      return;
    }

    try {
      await addModelItem(newItemValue.trim());
      setNewItemValue('');
      setIsAdding(false);
      await loadList();
      success('Model item added successfully');
    } catch (error: any) {
      showError(error.message || 'Failed to add model item');
    }
  };

  const handleEdit = (item: ModelListItem) => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editValue.trim()) {
      showError('Model name cannot be empty');
      return;
    }

    try {
      await updateModelItem(id, editValue.trim());
      setEditingId(null);
      setEditValue('');
      await loadList();
      success('Model item updated successfully');
    } catch (error: any) {
      showError(error.message || 'Failed to update model item');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await deleteModelItem(id);
      await loadList();
      success('Model item deleted successfully');
    } catch (error: any) {
      showError(error.message || 'Failed to delete model item');
    }
  };

  if (!isOpen) return null;

  const listSection = (
        <div className="p-6">
          {/* Info Message */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Manage the list of models that will appear in the dropdown when creating or editing equipment.
            </p>
          </div>

          {/* Add New Item */}
          <div className="mb-6">
            {!isAdding ? (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Add Model</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAdd();
                    } else if (e.key === 'Escape') {
                      setIsAdding(false);
                      setNewItemValue('');
                    }
                  }}
                  placeholder="Enter model name"
                  className="input flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-4 py-2 rounded-lg border border-green-500 bg-green-600 hover:bg-green-700 text-white transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setNewItemValue('');
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Model List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : modelList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No model items found. Add your first item above.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {modelList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center space-x-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  {editingId === item.id ? (
                    <>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(item.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="input flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(item.id)}
                        className="px-3 py-1.5 rounded-lg border border-green-500 bg-green-600 hover:bg-green-700 text-white transition-all duration-200"
                        title="Save"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200"
                        title="Cancel"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 text-sm font-medium text-gray-900">{item.name}</div>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="px-3 py-1.5 rounded-lg border border-blue-500 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all duration-200"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.name)}
                        className="px-3 py-1.5 rounded-lg border border-red-500 bg-red-50 hover:bg-red-100 text-red-700 transition-all duration-200"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
  );

  if (embedded) {
    return listSection;
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Model List Management</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            title="Close"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {listSection}
      </div>
    </div>
  );
};
