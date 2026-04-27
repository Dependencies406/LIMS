/**
 * Equipment File Upload Component
 * Handles file uploads for equipment attachments with drag & drop support
 */

import React, { useState, useCallback, useRef } from 'react';
import type { Equipment, EquipmentAttachment } from '../types';
import {
  uploadEquipmentFile,
  deleteEquipmentFile,
  formatFileSize,
  getFileTypeInfo,
} from '../services/equipmentFileService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { FilePreviewModal } from './FilePreviewModal';

export interface EquipmentFileUploadProps {
  jobId: string;
  equipmentIndex: number;
  equipment: Equipment;
  isReadOnly?: boolean;
  onFileUploaded?: () => void;
  onFileDeleted?: () => void;
}

export const EquipmentFileUpload: React.FC<EquipmentFileUploadProps> = ({
  jobId,
  equipmentIndex,
  equipment,
  isReadOnly = false,
  onFileUploaded,
  onFileDeleted,
}) => {
  const { currentUser, isAdmin } = useAuth();
  const { success, error: showError } = useToast();
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<EquipmentAttachment | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachments = equipment.attachments || [];

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isReadOnly) {
      showError('Cannot upload files in read-only mode');
      return;
    }
    if (!currentUser) {
      showError('You must be logged in to upload files');
      return;
    }

    const file = files[0]; // Handle single file for now
    
    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      showError(`File size exceeds maximum limit of ${formatFileSize(maxSize)}`);
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Upload file with progress tracking
      await uploadEquipmentFile(
        jobId,
        equipmentIndex,
        file,
        currentUser.uid,
        (progress) => setUploadProgress(progress)
      );
      
      success(`File "${file.name}" uploaded successfully`);
      onFileUploaded?.();
    } catch (err) {
      showError(`Failed to upload file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [jobId, equipmentIndex, currentUser, isReadOnly, showError, success, onFileUploaded]);

  const handleDelete = useCallback(async (attachment: EquipmentAttachment) => {
    if (isReadOnly) {
      showError('Cannot delete files in read-only mode');
      return;
    }
    if (!currentUser) {
      showError('You must be logged in to delete files');
      return;
    }

    // Check permissions: only uploader or admin can delete
    if (attachment.uploadedBy !== currentUser.uid && !isAdmin) {
      showError('You do not have permission to delete this file');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${attachment.fileName}"?`)) {
      return;
    }

    try {
      setDeletingId(attachment.id);
      await deleteEquipmentFile(jobId, equipmentIndex, attachment, currentUser.uid);
      success(`File "${attachment.fileName}" deleted successfully`);
      onFileDeleted?.();
    } catch (err) {
      showError(`Failed to delete file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  }, [jobId, equipmentIndex, currentUser, isAdmin, isReadOnly, showError, success, onFileDeleted]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isReadOnly && !uploading) {
      setDragging(true);
    }
  }, [isReadOnly, uploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    
    if (isReadOnly || uploading) return;
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [isReadOnly, uploading, handleFileSelect]);

  const handleDownload = useCallback((attachment: EquipmentAttachment) => {
    window.open(attachment.downloadURL, '_blank');
  }, []);

  const handlePreview = useCallback((attachment: EquipmentAttachment) => {
    setPreviewFile(attachment);
    setShowPreview(true);
  }, []);

  const formatDate = (date: Date | string | any) => {
    // Handle Firestore Timestamp
    if (date && typeof date === 'object' && 'toDate' in date) {
      const d = date.toDate();
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // Handle string or Date
    const d = typeof date === 'string' ? new Date(date) : date;
    if (d instanceof Date && !isNaN(d.getTime())) {
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return 'Unknown date';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Files / Attachments</h4>
        <span className="text-xs text-gray-500">{attachments.length} file(s)</span>
      </div>

      {/* Upload Area */}
      {!isReadOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragging
              ? 'border-primary-500 bg-primary-50'
              : uploading
              ? 'border-gray-300 bg-gray-50'
              : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50'
          }`}
        >
          {uploading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <p className="text-sm text-gray-600">Uploading... {uploadProgress > 0 && `${Math.round(uploadProgress)}%`}</p>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                accept="*/*"
                disabled={isReadOnly || uploading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                disabled={isReadOnly || uploading}
              >
                <svg className="w-6 h-6 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="block">Click to upload</span>
                <span className="block text-xs text-gray-500 mt-1">or drag and drop</span>
                <span className="block text-xs text-gray-400 mt-1">Max 50MB per file</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* File List */}
      {attachments.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {isReadOnly ? 'No files attached' : 'No files attached. Upload calibration certificates, photos, or datasheets.'}
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const fileInfo = getFileTypeInfo(attachment.fileType);
            const canDelete = !isReadOnly && (attachment.uploadedBy === currentUser?.uid || isAdmin);
            const isDeleting = deletingId === attachment.id;
            
            // Determine if file can be previewed
            const fileType = attachment.fileType.toLowerCase();
            const fileName = attachment.fileName.toLowerCase();
            const previewType = 
              fileType.includes('pdf') || fileName.endsWith('.pdf') ? 'pdf' :
              fileType.includes('spreadsheet') || fileType.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') ? 'excel' :
              fileType.includes('word') || fileType.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc') ? 'word' :
              fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? 'image' :
              'unsupported';

            return (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className={`text-2xl flex-shrink-0 ${fileInfo.color}`}>
                    {fileInfo.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate" title={attachment.fileName}>
                        {attachment.fileName}
                      </p>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatFileSize(attachment.fileSize)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                      <span>{formatDate(attachment.uploadedAt)}</span>
                      <span>•</span>
                      <span>Uploaded by {attachment.uploadedBy === currentUser?.uid ? 'You' : 'User'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                  {/* Preview Button - Show for PDF, Excel, Word, and Images */}
                  {(previewType !== 'unsupported') && (
                    <button
                      type="button"
                      onClick={() => handlePreview(attachment)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Preview"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownload(attachment)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(attachment)}
                      disabled={isDeleting}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {isDeleting ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewFile(null);
        }}
        file={previewFile}
      />
    </div>
  );
};

