import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DigitalSignature } from '../types';

interface SignatureCanvasProps {
  value?: DigitalSignature;
  onChange: (signature: DigitalSignature | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  signerName?: string;
  onSignerNameChange?: (name: string) => void;
  required?: boolean;
  /** When false, hide the "Signer Name" input (parent UI can provide it). */
  showSignerNameInput?: boolean;
}

type SignatureMode = 'draw' | 'upload';

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  value,
  onChange,
  placeholder = "Sign here",
  disabled = false,
  signerName = '',
  onSignerNameChange,
  required = false,
  showSignerNameInput = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Helper: convert Firestore Timestamp to Date
  const getDateFromValue = (dateValue: any): Date => {
    if (dateValue instanceof Date) return dateValue;
    if (dateValue && typeof dateValue.toDate === 'function') return dateValue.toDate();
    return new Date(dateValue);
  };

  // ── Canvas (draw mode) ────────────────────────────────────────────────────────

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const lw = 400, lh = 150;
    canvas.width = lw * dpr;
    canvas.height = lh * dpr;
    canvas.style.width = lw + 'px';
    canvas.style.height = lh + 'px';
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, lw, lh);

    if (value?.signatureData) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, lw, lh); setHasSignature(true); };
      img.src = value.signatureData;
    } else {
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(placeholder, lw / 2, lh / 2);
      setHasSignature(false);
    }
  }, [value?.signatureData, placeholder]);

  useEffect(() => {
    if (mode === 'draw') initializeCanvas();
  }, [initializeCanvas, mode]);

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || isLocked) return;
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!hasSignature) ctx.clearRect(0, 0, 400, 150);
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    lastPointRef.current = coords;
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [disabled, isLocked, hasSignature, getCanvasCoordinates]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || isLocked || !lastPointRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const current = getCanvasCoordinates(e.clientX, e.clientY);
    const last = lastPointRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPointRef.current = current;
  }, [isDrawing, disabled, isLocked, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const lw = 400, lh = 150;
    const tmp = document.createElement('canvas');
    const tCtx = tmp.getContext('2d');
    if (!tCtx) return;
    tmp.width = lw * dpr;
    tmp.height = lh * dpr;
    tCtx.scale(dpr, dpr);
    tCtx.drawImage(canvas, 0, 0, lw, lh);
    const data = tCtx.getImageData(0, 0, lw, lh);
    let hasContent = false;
    for (let i = 3; i < data.data.length; i += 4) {
      if (data.data[i] > 10) { hasContent = true; break; }
    }
    if (hasContent) {
      setHasSignature(true);
      onChange({ signatureData: canvas.toDataURL('image/png'), signerName: signerName || '', signedDate: new Date() });
    }
  }, [isDrawing, signerName, onChange]);

  const clearSignature = useCallback(() => {
    if (disabled) return;
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 400, 150);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(placeholder, 200, 75);
    }
    setHasSignature(false);
    setUploadError(null);
    onChange(undefined);
  }, [disabled, mode, placeholder, onChange]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (disabled || isLocked) return;
    const t = e.touches[0];
    startDrawing(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }) as any);
  }, [disabled, isLocked, startDrawing]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (disabled || isLocked) return;
    const t = e.touches[0];
    draw(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }) as any);
  }, [disabled, isLocked, draw]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  }, [stopDrawing]);

  // ── Upload mode ───────────────────────────────────────────────────────────────

  const processImageFile = useCallback((file: File) => {
    setUploadError(null);
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setUploadError('Please upload a PNG, JPG, GIF, WebP, or SVG image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      setHasSignature(true);
      onChange({ signatureData: dataUrl, signerName: signerName || '', signedDate: new Date() });
    };
    reader.readAsDataURL(file);
  }, [signerName, onChange]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [processImageFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  }, [disabled, processImageFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDraggingOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => setIsDraggingOver(false), []);

  // Switch mode — clear current signature so the pad starts fresh
  const switchMode = (next: SignatureMode) => {
    if (next === mode) return;
    setMode(next);
    setUploadError(null);
    // Keep existing signature visible when switching; user can clear manually
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const clearButton = hasSignature && !disabled && (
    <button
      type="button"
      onClick={clearSignature}
      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 transition-colors"
    >
      Clear
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Signer name row */}
      {showSignerNameInput ? (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signer Name {required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => onSignerNameChange?.(e.target.value)}
              disabled={disabled}
              className="input w-full"
              placeholder="Enter signer's name"
              required={required}
            />
          </div>
          {clearButton}
        </div>
      ) : (
        hasSignature && !disabled
          ? <div className="flex items-center justify-end">{clearButton}</div>
          : null
      )}

      {/* Mode tabs */}
      {!disabled && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => switchMode('draw')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'draw'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Draw
          </button>
          <button
            type="button"
            onClick={() => switchMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 ${
              mode === 'upload'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Image
          </button>
        </div>
      )}

      {/* Draw mode */}
      {mode === 'draw' && (
        <div className="space-y-2">
          {/* Lock / Unlock */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              disabled={disabled}
              className={`flex items-center space-x-2 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 ${
                isLocked
                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isLocked ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Unlock to Sign</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <span>Lock Signature</span>
                </>
              )}
            </button>
            <span className="text-xs text-gray-500">
              {isLocked ? '🔒 Signature pad is locked' : '🔓 Signature pad is unlocked'}
            </span>
          </div>

          {/* Canvas */}
          <div className="relative border border-gray-300 rounded-lg p-2 bg-white">
            <canvas
              ref={canvasRef}
              className={`w-full h-32 border border-gray-200 rounded ${
                disabled || isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair'
              }`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
                MozUserSelect: 'none', msUserSelect: 'none' }}
            />
            {isLocked && (
              <div className="absolute inset-2 flex items-center justify-center bg-gray-100 bg-opacity-75 rounded">
                <div className="text-center">
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">Signature pad is locked</p>
                  <p className="text-xs text-gray-400">Click "Unlock to Sign" to enable signing</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />

          {/* Drop zone — hidden when a signature is already uploaded */}
          {!hasSignature && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !disabled && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg transition-colors ${
                disabled
                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                  : isDraggingOver
                    ? 'border-blue-400 bg-blue-50 cursor-pointer'
                    : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
              }`}
            >
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm font-medium text-gray-600">
                {isDraggingOver ? 'Drop image here' : 'Click or drag & drop to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP, SVG — max 5 MB</p>
            </div>
          )}

          {/* Preview of uploaded signature */}
          {hasSignature && value?.signatureData && (
            <div className="relative border border-gray-300 rounded-lg p-2 bg-white">
              <img
                src={value.signatureData}
                alt="Uploaded signature"
                className="block mx-auto max-w-full rounded"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => !disabled && fileInputRef.current?.click()}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  Replace
                </button>
              )}
            </div>
          )}

          {uploadError && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {uploadError}
            </p>
          )}
        </div>
      )}

      {/* Signed-on timestamp */}
      {hasSignature && value && (
        <div className="text-xs text-gray-500">
          Signed on: {getDateFromValue(value.signedDate).toLocaleDateString('en-GB')} at{' '}
          {getDateFromValue(value.signedDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
};
