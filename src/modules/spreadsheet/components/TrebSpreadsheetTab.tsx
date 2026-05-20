/**
 * Renders a TREB spreadsheet only when a specific tab is active.
 * Use this inside a multi-tab UI so the spreadsheet is created when the user
 * switches to the spreadsheet tab and cleaned up when they switch away.
 *
 * Usage (React + TypeScript with tab state):
 *
 *   const [activeTabIndex, setActiveTabIndex] = useState(0);
 *   const SPREADSHEET_TAB_INDEX = 1;
 *
 *   return (
 *     <div>
 *       <TabList>
 *         <Tab onClick={() => setActiveTabIndex(0)}>Details</Tab>
 *         <Tab onClick={() => setActiveTabIndex(1)}>Spreadsheet</Tab>
 *       </TabList>
 *       <TabPanel hidden={activeTabIndex !== 0}>...</TabPanel>
 *       {activeTabIndex === SPREADSHEET_TAB_INDEX && (
 *         <TabPanel>
 *           <TrebSpreadsheetTab
 *             tabIndex={SPREADSHEET_TAB_INDEX}
 *             tabId="spreadsheet"
 *             isReadOnly={false}
 *             initialDocument={myTrebDoc}
 *             onSheetReady={(sheet) => { sheetRef.current = sheet; }}
 *             onDocumentChange={(doc) => setLastDoc(doc)}
 *           />
 *         </TabPanel>
 *       )}
 *     </div>
 *   );
 *
 * Mounting/unmounting: when activeTabIndex !== SPREADSHEET_TAB_INDEX the component
 * is not rendered, so the container is unmounted and the effect cleanup runs
 * (subscription cancelled, refs cleared). When the user switches back, the
 * component mounts again and TREB is created and attached to the new container.
 */

import React, { useEffect, useRef } from 'react';
import { TREB } from '@trebco/treb';
import type { EmbeddedSpreadsheet, EmbeddedSheetEvent, TREBDocument } from '@trebco/treb';

/** Options passed to TREB.CreateSpreadsheet (subset you can override). */
export interface TrebCreateOptions {
  toolbar?: 'show' | 'hide';
  formula_bar?: boolean;
  headers?: boolean;
  tab_bar?: boolean;
  undo?: boolean;
  in_cell_editor?: boolean;
  add_tab?: boolean;
  file_menu?: boolean;
  export?: boolean;
  font_scale?: boolean;
  font_stack?: boolean;
  markdown?: boolean;
  chart_menu?: boolean;
}

export interface TrebSpreadsheetTabProps {
  /** Index of the tab that contains this spreadsheet (for reference / accessibility). */
  tabIndex?: number;
  /** Tab id (e.g. 'spreadsheet') for aria. */
  tabId?: string;
  /** When true, editing is disabled. */
  isReadOnly?: boolean;
  /** Called when the TREB instance is created and attached. Use to load document or subscribe. */
  onSheetReady?: (sheet: EmbeddedSpreadsheet) => void;
  /** Optional: initial document to load. */
  initialDocument?: TREBDocument | null;
  /** Optional: subscribe to document-change / selection. */
  onDocumentChange?: (doc: TREBDocument) => void;
  /** Optional: extra options for TREB.CreateSpreadsheet. */
  trebOptions?: Partial<TrebCreateOptions>;
  /** Optional: CSS class for the container. */
  className?: string;
  /** Optional: inline styles for the container. */
  style?: React.CSSProperties;
}

const DEFAULT_TREB_OPTIONS: TrebCreateOptions = {
  toolbar: 'show',
  formula_bar: true,
  headers: true,
  tab_bar: true,
  undo: true,
  in_cell_editor: true,
  add_tab: true,
  file_menu: false,
  export: false,
  font_scale: true,
  font_stack: true,
  markdown: true,
  chart_menu: true,
};

/**
 * TypeScript component that mounts TREB.CreateSpreadsheet into a DOM container
 * that is rendered only when the parent shows this tab. Lifecycle:
 * - When the component mounts (user switched to this tab), the container ref
 *   is set, then the effect runs and creates the TREB instance.
 * - When the component unmounts (user switched away), the effect cleanup runs:
 *   subscription is cancelled and refs are cleared; the container is removed
 *   from the DOM so TREB's root is detached.
 */
export const TrebSpreadsheetTab: React.FC<TrebSpreadsheetTabProps> = ({
  tabIndex = 0,
  tabId = 'spreadsheet-tab',
  isReadOnly = false,
  onSheetReady,
  initialDocument = null,
  onDocumentChange,
  trebOptions = {},
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<EmbeddedSpreadsheet | null>(null);
  const subscriptionTokenRef = useRef<ReturnType<EmbeddedSpreadsheet['Subscribe']> | null>(null);

  const onSheetReadyRef = useRef(onSheetReady);
  const onDocumentChangeRef = useRef(onDocumentChange);
  useEffect(() => {
    onSheetReadyRef.current = onSheetReady;
    onDocumentChangeRef.current = onDocumentChange;
  }, [onSheetReady, onDocumentChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options = { ...DEFAULT_TREB_OPTIONS, ...trebOptions };
    const sheet: EmbeddedSpreadsheet = TREB.CreateSpreadsheet({
      container,
      toolbar: options.toolbar === 'hide' ? false : options.toolbar,
      formula_bar: options.formula_bar,
      headers: options.headers,
      tab_bar: options.tab_bar,
      undo: options.undo,
      in_cell_editor: !isReadOnly && (options.in_cell_editor ?? true),
      add_tab: options.add_tab,
      file_menu: options.file_menu,
      export: options.export,
      font_scale: options.font_scale,
      font_stack: options.font_stack,
      markdown: options.markdown,
      chart_menu: !isReadOnly && (options.chart_menu ?? true),
    });

    sheetRef.current = sheet;

    if (onDocumentChangeRef.current) {
      const token = sheet.Subscribe((event: EmbeddedSheetEvent) => {
        if (event.type === 'document-change') {
          try {
            const doc = sheet.SerializeDocument();
            onDocumentChangeRef.current?.(doc);
          } catch {
            // ignore
          }
        }
      });
      subscriptionTokenRef.current = token;
    }

    if (initialDocument) {
      try {
        sheet.LoadDocument(initialDocument, { recalculate: false, flush: true });
      } catch {
        // ignore
      }
    }

    onSheetReadyRef.current?.(sheet);

    return () => {
      if (subscriptionTokenRef.current !== null && sheetRef.current) {
        try {
          sheetRef.current.Cancel(subscriptionTokenRef.current);
        } catch {
          // ignore
        }
        subscriptionTokenRef.current = null;
      }
      sheetRef.current = null;
    };
    // Only recreate when isReadOnly changes. trebOptions/initialDocument are used at mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnly]);

  return (
    <div
      ref={containerRef}
      role="tabpanel"
      id={tabId}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={tabIndex}
      className={className || 'min-h-[400px] h-full w-full'}
      style={style}
    />
  );
};

export default TrebSpreadsheetTab;
