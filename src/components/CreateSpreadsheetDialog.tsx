import React, { useState, useEffect } from 'react';
import { Modal, ModalFooter, Button } from './common';
import { validateCalibrationPoints, parseCalibrationPoints } from '../utils/calibrationPointParser';

interface CreateSpreadsheetDialogProps {
  isOpen: boolean;
  calibrationPointPreFill?: string; // Pre-fill from equipment.calibrationPoint
  onClose: () => void;
  onConfirm: (calibrationPoints: number[], templateId: string | null) => void;
}

export const CreateSpreadsheetDialog: React.FC<CreateSpreadsheetDialogProps> = ({
  isOpen,
  calibrationPointPreFill = '',
  onClose,
  onConfirm,
}) => {
  const [calibrationPointsInput, setCalibrationPointsInput] = useState(calibrationPointPreFill);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCalibrationPointsInput(calibrationPointPreFill);
      setValidationError(null);
    }
  }, [isOpen, calibrationPointPreFill]);

  const handleCalibrationPointsChange = (value: string) => {
    setCalibrationPointsInput(value);
    const validation = validateCalibrationPoints(value);
    setValidationError(validation.isValid ? null : validation.error || null);
  };

  const handleConfirm = () => {
    const validation = validateCalibrationPoints(calibrationPointsInput);
    if (!validation.isValid) {
      setValidationError(validation.error || null);
      return;
    }

    const parsed = parseCalibrationPoints(calibrationPointsInput);
    if (!parsed || parsed.length === 0) {
      setValidationError('Invalid calibration points');
      return;
    }

    onConfirm(parsed, null);
  };

  const isValid = validationError === null && calibrationPointsInput.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Spreadsheet"
      size="xlarge"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Calibration Points <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={calibrationPointsInput}
          onChange={(e) => handleCalibrationPointsChange(e.target.value)}
          placeholder="0, 10, 20, 50, 100"
          className={`input w-full ${validationError ? 'border-red-500' : ''}`}
          autoFocus
        />
        {validationError && (
          <p className="mt-1 text-sm text-red-600">{validationError}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Enter numbers separated by commas. A blank TREB spreadsheet will be created.
        </p>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!isValid}
        >
          Create Spreadsheet
        </Button>
      </ModalFooter>
    </Modal>
  );
};
