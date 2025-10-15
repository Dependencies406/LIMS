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
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  value,
  onChange,
  placeholder = "Sign here",
  disabled = false,
  signerName = '',
  onSignerNameChange,
  required = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isLocked, setIsLocked] = useState(true); // Start locked by default
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Helper function to convert Firestore Timestamp to Date
  const getDateFromValue = (dateValue: any): Date => {
    if (dateValue instanceof Date) {
      return dateValue;
    }
    if (dateValue && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    return new Date(dateValue);
  };

  // Initialize canvas with improved precision
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get device pixel ratio for crisp rendering
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Set logical canvas size
    const logicalWidth = 400;
    const logicalHeight = 150;
    
    // Set actual canvas size accounting for device pixel ratio
    canvas.width = logicalWidth * devicePixelRatio;
    canvas.height = logicalHeight * devicePixelRatio;
    
    // Set display size
    canvas.style.width = logicalWidth + 'px';
    canvas.style.height = logicalHeight + 'px';
    
    // Scale context to match device pixel ratio
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Set drawing styles for better precision
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'high';

    // Clear canvas
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // If there's an existing signature, draw it
    if (value?.signatureData) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, logicalWidth, logicalHeight);
        setHasSignature(true);
      };
      img.src = value.signatureData;
    } else {
      // Draw placeholder text
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(placeholder, logicalWidth / 2, logicalHeight / 2);
      setHasSignature(false);
    }
  }, [value?.signatureData, placeholder]);

  useEffect(() => {
    initializeCanvas();
  }, [initializeCanvas]);

  // Get precise coordinates with improved calculation
  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Calculate coordinates relative to canvas display size (not internal pixel size)
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return { x, y };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || isLocked) return;
    
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    lastPointRef.current = coords;
    
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [disabled, isLocked, getCanvasCoordinates]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || isLocked || !lastPointRef.current) return;

    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentCoords = getCanvasCoordinates(e.clientX, e.clientY);
    const lastCoords = lastPointRef.current;

    // Draw a line from last point to current point
    ctx.beginPath();
    ctx.moveTo(lastCoords.x, lastCoords.y);
    ctx.lineTo(currentCoords.x, currentCoords.y);
    ctx.stroke();

    lastPointRef.current = currentCoords;
  }, [isDrawing, disabled, isLocked, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    lastPointRef.current = null;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas has content (not just placeholder)
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a temporary canvas to check for content
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const logicalWidth = 400;
    const logicalHeight = 150;
    
    tempCanvas.width = logicalWidth * devicePixelRatio;
    tempCanvas.height = logicalHeight * devicePixelRatio;
    tempCtx.scale(devicePixelRatio, devicePixelRatio);
    
    // Draw the current canvas content to temp canvas
    tempCtx.drawImage(canvas, 0, 0, logicalWidth, logicalHeight);
    
    // Check if there's any non-transparent content
    const imageData = tempCtx.getImageData(0, 0, logicalWidth, logicalHeight);
    let hasContent = false;
    
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 10) { // Alpha channel > 10 (not transparent)
        hasContent = true;
        break;
      }
    }

    if (hasContent) {
      setHasSignature(true);
      const signatureData = canvas.toDataURL('image/png');
      const signature: DigitalSignature = {
        signatureData,
        signerName: signerName || '',
        signedDate: new Date()
      };
      onChange(signature);
    }
  }, [isDrawing, signerName, onChange]);

  const clearSignature = useCallback(() => {
    if (disabled) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const logicalWidth = 400;
    const logicalHeight = 150;
    
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    
    // Redraw placeholder
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(placeholder, logicalWidth / 2, logicalHeight / 2);
    
    setHasSignature(false);
    onChange(undefined);
  }, [disabled, placeholder, onChange]);

  // Touch event handlers with improved precision
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (disabled || isLocked) return;
    
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    startDrawing(mouseEvent as any);
  }, [disabled, isLocked, startDrawing]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (disabled || isLocked) return;
    
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    draw(mouseEvent as any);
  }, [disabled, isLocked, draw]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  }, [stopDrawing]);

  return (
    <div className="space-y-3">
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
        {hasSignature && !disabled && (
          <button
            type="button"
            onClick={clearSignature}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      
      <div className="space-y-2">
        {/* Lock/Unlock Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Unlock to Sign</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <span>Lock Signature</span>
                </>
              )}
            </button>
          </div>
          <div className="text-xs text-gray-500">
            {isLocked ? '🔒 Signature pad is locked' : '🔓 Signature pad is unlocked'}
          </div>
        </div>

        {/* Canvas Container */}
        <div className="relative border border-gray-300 rounded-lg p-2 bg-white">
          <canvas
            ref={canvasRef}
            className={`w-full h-32 border border-gray-200 rounded ${
              disabled || isLocked 
                ? 'cursor-not-allowed opacity-50' 
                : 'cursor-crosshair'
            }`}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ 
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}
          />
          {isLocked && (
            <div className="absolute inset-2 flex items-center justify-center bg-gray-100 bg-opacity-75 rounded border-gray-200">
              <div className="text-center">
                <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-sm text-gray-500 font-medium">Signature pad is locked</p>
                <p className="text-xs text-gray-400">Click "Unlock to Sign" to enable signing</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {hasSignature && value && (
        <div className="text-xs text-gray-500">
          Signed on: {getDateFromValue(value.signedDate).toLocaleDateString('en-GB')} at {getDateFromValue(value.signedDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
};
