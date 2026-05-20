import React, { useState, useEffect } from 'react';
import {
  getProtectionSettings,
  setUnlockPassword,
  type SpreadsheetProtectionSettings,
} from '../services/spreadsheetProtectionService';
import { useAuth } from '../contexts/AuthContext';

interface SpreadsheetProtectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export const SpreadsheetProtectionSettingsModal: React.FC<SpreadsheetProtectionSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<SpreadsheetProtectionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError(null);
    setNewPassword('');
    setConfirmPassword('');
    setLoading(true);
    getProtectionSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSetPassword = async () => {
    if (!currentUser?.uid) {
      setError('You must be signed in to change this setting.');
      return;
    }
    const p = newPassword.trim();
    if (p.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (p !== confirmPassword.trim()) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUnlockPassword(p, currentUser.uid);
      setSettings({ hasPassword: true });
      setNewPassword('');
      setConfirmPassword('');
      onSave?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save password');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!currentUser?.uid) {
      setError('You must be signed in to change this setting.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUnlockPassword('', currentUser.uid);
      setSettings({ hasPassword: false });
      setNewPassword('');
      setConfirmPassword('');
      onSave?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove password');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Spreadsheet protection</h2>
        <p className="text-sm text-gray-600 mb-4">
          Set a password that will be required to unlock locked cells or to clear their content (e.g. Delete key) in spreadsheets.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-4">
              Status: <strong>{settings?.hasPassword ? 'Password set' : 'No password set'}</strong>
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {settings?.hasPassword ? 'New password (leave blank to keep current)' : 'Password'}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="At least 4 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Confirm"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-4" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              {settings?.hasPassword && (
                <button
                  type="button"
                  onClick={handleRemovePassword}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                >
                  Remove password
                </button>
              )}
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={
                  saving ||
                  newPassword.trim().length < 4 ||
                  newPassword.trim() !== confirmPassword.trim()
                }
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : settings?.hasPassword ? 'Change password' : 'Set password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
