/**
 * File Upload Component
 * Handles file uploads with drag-and-drop support
 */

import React, { useState, useRef } from 'react';
import type { FileAttachment } from '../types';
import { Button, LoadingSpinner } from './common';
import {
  validateFile,
  formatFileSize,
  getFileIcon,
} from '../services/fileUploadService';

interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  existingFiles?: FileAttachment[];
  multiple?: boolean;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  onDelete,
  existingFiles = [],
  multiple = true,
  maxSize = 10 * 1024 * 1024, // 10MB default
  allowedTypes,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(files);
  };

  const handleFiles = async (files: File[]) => {
    setError(null);

    // Validate files
    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const validation = validateFile(file, { maxSize, allowedTypes });
      if (validation.valid) {
        validFiles.push(file);
      } else {
        validationErrors.push(`${file.name}: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join('\n'));
    }

    if (validFiles.length > 0) {
      setUploading(true);
      try {
        await onUpload(validFiles);
        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        console.error('Upload error:', err);
        setError('Failed to upload files. Please try again.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleDelete = async (fileId: string) => {
    if (onDelete && !disabled) {
      try {
        await onDelete(fileId);
      } catch (err) {
        console.error('Delete error:', err);
        setError('Failed to delete file. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary-400'}
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={!disabled ? handleBrowse : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
          accept={allowedTypes?.join(',')}
        />

        {uploading ? (
          <div className="flex flex-col items-center">
            <LoadingSpinner size="lg" />
            <p className="mt-2 text-sm text-gray-600">Uploading files...</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-2">📎</div>
            <p className="text-sm text-gray-600 mb-1">
              {multiple
                ? 'Drag and drop files here, or click to browse'
                : 'Drag and drop a file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-500">
              Max size: {formatFileSize(maxSize)}
              {allowedTypes && ` • Types: ${allowedTypes.join(', ')}`}
            </p>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Existing Files */}
      {existingFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Attached Files</h4>
          {existingFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-2xl flex-shrink-0">{getFileIcon(file.type)}</span>
                <div className="min-w-0 flex-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 truncate block"
                  >
                    {file.name}
                  </a>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} •{' '}
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {onDelete && !disabled && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(file.id)}
                  className="ml-2"
                >
                  Delete
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

