import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  children: React.ReactNode;
  panel: React.ReactNode;
};

/**
 * Hover help panel rendered via portal so it is not clipped by main overflow
 * and stacks above the app header (z-40+).
 */
export function SettingsCardHelpTooltip({ children, panel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    if (!wrapRef.current || !tipRef.current) return;
    const wrap = wrapRef.current;
    const anchor =
      wrap.querySelector<HTMLElement>('[data-settings-help-anchor]') ??
      wrap.querySelector('button');
    const el = anchor ?? wrap;
    const br = el.getBoundingClientRect();
    const tr = tipRef.current.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    let top = br.top - tr.height - gap;
    let left = br.left;
    if (top < margin) top = margin;
    if (left + tr.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - tr.width - margin);
    }
    if (left < margin) left = margin;
    setPos({ top, left });
    setPlaced(true);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className={`fixed z-[200] w-80 max-w-[calc(100vw-16px)] bg-gray-900 text-white text-sm rounded-lg p-4 pointer-events-none shadow-xl transition-opacity duration-150 ${
              placed ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ top: pos.top, left: pos.left }}
          >
            {panel}
            <div
              className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"
              aria-hidden
            />
          </div>,
          document.body
        )}
    </div>
  );
}
