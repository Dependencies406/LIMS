import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { 
  saveUserAvatar, 
  removeUserAvatar, 
  PRESET_AVATARS, 
  generatePresetAvatarUrl 
} from '../services/userAvatarService';

interface UserAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserAvatarModal: React.FC<UserAvatarModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !currentUser) return null;

  // Get user initials
  const getUserInitials = () => {
    if (currentUser?.firstName && currentUser?.lastName) {
      return `${currentUser.firstName[0]}${currentUser.lastName[0]}`.toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email[0].toUpperCase();
    }
    return 'U';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        return;
      }

      // Validate file size (max 2MB)
      const maxSize = 2 * 1024 * 1024;
      if (file.size > maxSize) {
        showError('Image size must be less than 2MB');
        return;
      }

      setSelectedFile(file);
      setSelectedPreset(null);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Generate preview for preset
    const preview = generatePresetAvatarUrl(getUserInitials(), presetId);
    setPreviewUrl(preview);
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser?.avatarUrl) return;

    setUploading(true);
    try {
      await removeUserAvatar(currentUser.uid, currentUser.avatarUrl);
      success('Avatar removed successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error removing avatar:', err);
      showError(err.message || 'Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile && !selectedPreset) {
      showError('Please select a preset color or upload an image');
      return;
    }

    setUploading(true);
    try {
      await saveUserAvatar(
        currentUser.uid,
        selectedFile,
        selectedPreset,
        getUserInitials()
      );
      
      success('Avatar updated successfully');
      onSuccess();
      onClose();
      
      // Reset form
      setSelectedFile(null);
      setSelectedPreset(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Error saving avatar:', err);
      showError(err.message || 'Failed to save avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setSelectedFile(null);
      setSelectedPreset(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">Change Avatar</h3>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-500 hover:text-gray-700 text-2xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {/* Current Avatar Preview */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Preview</p>
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-200 bg-gray-100 flex items-center justify-center">
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Avatar preview" 
                  className="w-full h-full object-cover"
                />
              ) : currentUser?.avatarUrl ? (
                <img 
                  src={currentUser.avatarUrl} 
                  alt="Current avatar" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary-700 font-semibold text-2xl">
                  {getUserInitials()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Preset Colors */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Choose a Color</p>
          <div className="grid grid-cols-5 gap-3">
            {PRESET_AVATARS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                disabled={uploading}
                className={`w-12 h-12 rounded-full border-2 transition-all ${
                  selectedPreset === preset.id
                    ? 'border-primary-600 scale-110 shadow-lg'
                    : 'border-gray-300 hover:border-gray-400'
                } disabled:opacity-50`}
                style={{ backgroundColor: preset.color }}
                title={preset.name}
              />
            ))}
          </div>
        </div>

        {/* Upload Custom Image */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Or Upload Your Own</p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
              id="avatar-upload"
            />
            <label
              htmlFor="avatar-upload"
              className={`cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-600">
                {selectedFile ? selectedFile.name : 'Click to upload image'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Max 2MB (JPG, PNG, GIF)</p>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          {currentUser?.avatarUrl && (
            <button
              onClick={handleRemoveAvatar}
              disabled={uploading}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              Remove Avatar
            </button>
          )}
          <div className={`flex space-x-3 ${currentUser?.avatarUrl ? 'ml-auto' : ''}`}>
            <button
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={uploading || (!selectedFile && !selectedPreset)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Avatar</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
