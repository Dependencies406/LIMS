// Ambient module declaration for jspdf-autotable (not installed as a package).
declare module 'jspdf-autotable' {
  interface UserOptions {
    startY?: number;
    margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
    head?: any[][];
    body?: any[][];
    foot?: any[][];
    styles?: Record<string, any>;
    headStyles?: Record<string, any>;
    footStyles?: Record<string, any>;
    bodyStyles?: Record<string, any>;
    alternateRowStyles?: Record<string, any>;
    columnStyles?: Record<string, Record<string, any>>;
    didDrawPage?: (data: any) => void;
    didParseCell?: (data: any) => void;
    willDrawCell?: (data: any) => void;
    didDrawCell?: (data: any) => void;
    [key: string]: any;
  }
  function autoTable(doc: any, options: UserOptions): void;
  export default autoTable;
}
