// Type definitions for jspdf-autotable 3.5
// Project: https://github.com/simonbengtsson/jspdf-autotable
// Definitions by: Steiner <https://github.com/Steiner-w>
//                 Dan Manastireanu <https://github.com/danmana>
//                 Philippe Matray <https://github.com/pmatray>
//                 Ville V. Vanninen <https://github.com/vvv-vanninen>
//                 Max S. <https://github.com/masch-it>
//                 Derek Peplinski <https://github.com/dpeplinski>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.4

import { jsPDF } from 'jspdf';

declare module 'jspdf' {
    interface jsPDF {
        autoTable(options: import('jspdf-autotable').Options): jsPDF;
        autoTable(columns: string[] | import('jspdf-autotable').Column[], data: any[], options?: import('jspdf-autotable').Options): jsPDF;
        readonly lastAutoTable: import('jspdf-autotable').AutoTable;
        autoTableHtmlToJson(table: HTMLElement, includeHiddenElements?: boolean): any;
    }
}

declare namespace autoTable {
    type PageHook = (data: HookData) => void;
    type CellHook = (data: CellHookData) => void;
    
    interface Options {
        // Properties
        theme?: 'striped' | 'grid' | 'plain';
        styles?: Styles;
        headStyles?: Styles;
        bodyStyles?: Styles;
        footStyles?: Styles;
        alternateRowStyles?: Styles;
        columnStyles?: { [key: string]: Styles };

        // Hooks
        didParseCell?: CellHook;
        willDrawCell?: CellHook;
        didDrawCell?: CellHook;
        didDrawPage?: PageHook;

        // Content
        head?: any;
        body?: any;
        foot?: any;
        html?: string | HTMLElement;
        includeHiddenHtml?: boolean;

        // Other
        startY?: number;
        margin?: Margin;
        pageBreak?: 'auto' | 'avoid' | 'always';
        rowPageBreak?: 'auto' | 'avoid';
        tableWidth?: 'auto' | 'wrap' | number;
        showHead?: 'everyPage' | 'firstPage' | 'never';
        showFoot?: 'everyPage' | 'lastPage' | 'never';
        tableLineWidth?: number;
        tableLineColor?: Color;
        useCss?: boolean;
    }

    interface Styles {
        font?: 'helvetica' | 'times' | 'courier' | string;
        fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
        overflow?: 'linebreak' | 'ellipsize' | 'visible' | 'hidden';
        fillColor?: Color;
        textColor?: Color;
        cellWidth?: 'auto' | 'wrap' | number;
        minCellWidth?: number;
        minCellHeight?: number;
        halign?: 'left' | 'center' | 'right';
        valign?: 'top' | 'middle' | 'bottom';
        fontSize?: number;
        cellPadding?: number;
        lineColor?: Color;
        lineWidth?: number;
    }

    interface Column {
        header?: string;
        title?: string; // deprecated
        dataKey?: string | number;
    }
    
    interface AutoTable {
        readonly head: Cell[][];
        readonly body: Cell[][];
        readonly foot: Cell[][];
        readonly pageCount: number;
        readonly settings: Options;
        readonly finalY: number;
        readonly startY: number;
        readonly table: Table;
        readonly pageNumber: number;
        readonly pageStartX: number;
        readonly pageStartY: number;
        readonly startPageNumber: number;
    }

    interface Table {
        readonly settings: Options;
        readonly margins: { top: number; right: number; bottom: number; left: number };
        readonly pageCount: number;
        readonly columns: Column[];
        readonly head: Row[];
        readonly body: Row[];
        readonly foot: Row[];
    }
    
    interface Row {
        readonly raw: any[] | any;
        readonly cells: { [key: string]: Cell };
        readonly index: number;
        readonly section: 'head' | 'body' | 'foot';
        readonly height: number;
        readonly y: number;
        readonly pageNumber: number;
    }

    interface Cell {
        readonly raw: any;
        readonly styles: Styles;
        readonly text: string | string[];
        readonly section: 'head' | 'body' | 'foot';
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly contentHeight: number;
        readonly textPos: { x: number; y: number };
        readonly colSpan: number;
        readonly rowSpan: number;
    }

    interface HookData {
        readonly table: Table;
        readonly pageNumber: number;
        readonly settings: Options;
        readonly doc: jsPDF;
        readonly cursor: { x: number; y: number };
    }

    interface CellHookData extends HookData {
        readonly cell: Cell;
        readonly row: Row;
        readonly column: Column;
        readonly section: 'head' | 'body' | 'foot';
    }
    
    type Color = number | number[] | string;
    type Margin = number | { top?: number; right?: number; bottom?: number; left?: number; horizontal?: number; vertical?: number };
}

export default autoTable;
