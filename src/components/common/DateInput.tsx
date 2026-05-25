/**
 * DateInput
 *
 * Displays a text box that accepts keyboard input in DD/MM/YYYY format.
 * A calendar icon on the right opens the browser's native date picker.
 *
 * - Click the text box  → type the date with keyboard (DD/MM/YYYY)
 * - Click the calendar  → open the native browser date picker
 *
 * The value prop and onChange event always use ISO format (YYYY-MM-DD),
 * identical to a plain <input type="date">, so this is a drop-in replacement.
 */

import React, { useRef, useState, useEffect } from 'react';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string;
}

/** YYYY-MM-DD  →  DD/MM/YYYY */
function isoToDisplay(iso?: string): string {
  if (!iso) return '';
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return '';
  const [year, month, day] = parts;
  if (!year || !month || !day) return '';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** DD/MM/YYYY  →  YYYY-MM-DD  (returns null if invalid) */
function displayToISO(text: string): string | null {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const DateInput: React.FC<DateInputProps> = ({
  value = '',
  className = '',
  disabled,
  placeholder = 'DD/MM/YYYY',
  onChange,
  onBlur,
  onFocus,
  id,
  name,
  required,
  min,
  max,
}) => {
  const pickerRef = useRef<HTMLInputElement>(null);
  const isFocused = useRef(false);

  // Local text state – mirrors DD/MM/YYYY while the user types
  const [text, setText] = useState(() => isoToDisplay(value));

  // Sync display text when the value prop changes externally (e.g. form reset,
  // parent state update) but NOT while the user is actively typing.
  useEffect(() => {
    if (!isFocused.current) {
      setText(isoToDisplay(value));
    }
  }, [value]);

  // ── Text input handlers ──────────────────────────────────────────────────

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);

    // Fire onChange as soon as the typed text forms a valid ISO date
    const iso = displayToISO(raw);
    if (iso && onChange) {
      const synth = Object.create(e);
      synth.target = { ...e.target, value: iso };
      onChange(synth as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleTextFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = true;
    onFocus?.(e as any);
  };

  const handleTextBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = false;
    const iso = displayToISO(text);
    if (iso) {
      // Normalize display (e.g. "5/4/2026" → "05/04/2026")
      setText(isoToDisplay(iso));
      if (onChange) {
        const synth = Object.create(e);
        synth.target = { ...e.target, value: iso };
        onChange(synth as React.ChangeEvent<HTMLInputElement>);
      }
    } else if (!text.trim()) {
      // Cleared
      setText('');
      if (onChange) {
        const synth = Object.create(e);
        synth.target = { ...e.target, value: '' };
        onChange(synth as React.ChangeEvent<HTMLInputElement>);
      }
    } else {
      // Invalid partial input – revert to last known good value
      setText(isoToDisplay(value));
    }
    onBlur?.(e as any);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  // ── Calendar icon handler ────────────────────────────────────────────────

  const handleCalendarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !pickerRef.current) return;
    pickerRef.current.focus();
    try {
      (pickerRef.current as any).showPicker();
    } catch {
      pickerRef.current.click();
    }
  };

  // ── Native picker change ─────────────────────────────────────────────────

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value; // YYYY-MM-DD from native picker
    setText(isoToDisplay(iso));
    onChange?.(e);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={['relative flex items-center', className].filter(Boolean).join(' ')}>
      {/* Visible text input – keyboard entry */}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleTextChange}
        onFocus={handleTextFocus}
        onBlur={handleTextBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400 disabled:cursor-not-allowed"
      />

      {/* Calendar icon – opens native date picker */}
      <button
        type="button"
        onClick={handleCalendarClick}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Open date picker"
        className="ml-1 flex-shrink-0 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Hidden native date input – only used by the calendar picker */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
