import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { printReceiptSheet } from './receiptPrint';
import { toEnglishDigits } from './persian';

export interface PdfExportOptions {
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'a5';
  marginMm?: number;
}

/**
 * Standard Paper Dimensions (ISO 216) in millimeters
 */
const PAPER_DIMENSIONS_MM = {
  a4: {
    portrait: { width: 210, height: 297 },
    landscape: { width: 297, height: 210 }
  },
  a5: {
    portrait: { width: 148, height: 210 },
    landscape: { width: 210, height: 148 }
  }
};

/**
 * Pixel Reference Widths (at 96 DPI CSS Pixels)
 * Standardized across all documents to prevent inconsistent font scaling
 */
const PAPER_PIXEL_WIDTHS = {
  a4: {
    portrait: 794,
    landscape: 1123
  },
  a5: {
    portrait: 559,
    landscape: 794
  }
};

/**
 * High-Fidelity Client-Side PDF Exporter
 * - Guarantees proper Persian text shaping & cursive ligatures (no disconnected letters)
 * - Strictly enforces standard A4/A5 boundaries with discrete canvas slicing (no bleed/overflow)
 * - Harmonizes font sizes across all tables, headers, and form fields
 */
export async function exportElementToPdf(
  elementIdOrElement: string | HTMLElement,
  options: PdfExportOptions = {}
): Promise<boolean> {
  const {
    filename = 'document.pdf',
    orientation = 'landscape',
    format = 'a4',
    marginMm = 4
  } = options;

  let targetElement: HTMLElement | null = null;
  if (typeof elementIdOrElement === 'string') {
    targetElement = document.getElementById(elementIdOrElement);
  } else {
    targetElement = elementIdOrElement;
  }

  if (!targetElement) {
    console.error(`[PdfExport] Target element "${elementIdOrElement}" not found.`);
    return false;
  }

  // Ensure all fonts (especially Vazirmatn) are completely loaded
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const paperDims = PAPER_DIMENSIONS_MM[format][orientation];
  const renderWidthPx = PAPER_PIXEL_WIDTHS[format][orientation];

  // 1. Create a clean, isolated off-screen rendered container attached to document.body
  // Positioned at top: 0, left: 0 with opacity: 0 and z-index: -9999
  // (Avoids left: -99999px which disrupts font shaping and canvas rasterization in Blink/WebKit)
  const container = document.createElement('div');
  container.className = 'amgas-pdf-export-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${renderWidthPx}px`;
  container.style.minHeight = 'auto';
  container.style.background = '#ffffff';
  container.style.color = '#020617';
  container.style.zIndex = '-9999';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.style.direction = 'rtl';
  container.style.boxSizing = 'border-box';
  container.style.padding = '4px';

  // 2. Clone the target element
  const clone = targetElement.cloneNode(true) as HTMLElement;

  // 3. Serialize all live input, textarea, and select values into clean static text spans
  const originalInputs = targetElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
  const clonedInputs = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');

  originalInputs.forEach((orig, idx) => {
    const cloned = clonedInputs[idx];
    if (cloned && cloned.parentNode) {
      let val = '';
      if (orig instanceof HTMLSelectElement) {
        val = orig.options[orig.selectedIndex]?.text || orig.value || '';
      } else {
        val = orig.value || '';
      }

      const isInsideTable = Boolean(cloned.closest('table'));
      const isInsideKardex = Boolean(cloned.closest('.kardex-table') || cloned.closest('#printable-gas-kardex'));
      
      const textSpan = document.createElement('span');
      textSpan.textContent = toEnglishDigits(val) || '—';
      
      // Proportional font sizing: never let input text inflate to 15-18px
      const fontSize = isInsideKardex ? '10.5px' : isInsideTable ? '12.5px' : '13.5px';
      
      textSpan.style.display = 'inline-block';
      textSpan.style.color = '#020617';
      textSpan.style.fontWeight = '700';
      textSpan.style.fontSize = fontSize;
      textSpan.style.lineHeight = '1.2';
      textSpan.style.fontFamily = "'Vazirmatn', -apple-system, BlinkMacSystemFont, Tahoma, Arial, sans-serif";
      textSpan.style.letterSpacing = 'normal';
      textSpan.style.wordSpacing = 'normal';
      
      if (/^[0-9\s/.,\-–—]+$/.test(val.trim())) {
        textSpan.style.fontFamily = "'Segoe UI', Arial, Roboto, sans-serif";
        textSpan.style.direction = 'ltr';
        textSpan.style.unicodeBidi = 'isolate';
      }

      cloned.parentNode.replaceChild(textSpan, cloned);
    }
  });

  // 4. Remove all screen buttons, close triggers, user badges, and no-print helpers from clone
  clone.querySelectorAll('button, .print-hidden, [data-no-print], .no-print, [class*="print:hidden"], [data-user-badge], .system-user-badge, .cursor-pointer').forEach(el => el.remove());

  // 5. Inject strict isolation stylesheet into container:
  // - Enforces letter-spacing: normal !important on ALL Persian text (eliminates disconnected letters)
  // - Enforces table-layout: fixed !important with 100% width (eliminates horizontal overflow)
  // - Harmonizes table typography
  const isolationStyle = document.createElement('style');
  isolationStyle.textContent = `
    @font-face {
      font-family: 'Vazirmatn';
      src: url('/webfonts/Vazirmatn-Regular.woff2') format('woff2'),
           url('/webfonts/Vazirmatn[wght].woff2') format('woff2-variations');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('/webfonts/Vazirmatn-Bold.woff2') format('woff2'),
           url('/fonts/Vazirmatn-ExtraBold.ttf') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('/webfonts/Vazirmatn-ExtraBold.woff2') format('woff2'),
           url('/fonts/Vazirmatn-ExtraBold.ttf') format('truetype');
      font-weight: 800;
      font-style: normal;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('/webfonts/Vazirmatn-Black.woff2') format('woff2'),
           url('/webfonts/Vazirmatn-ExtraBold.woff2') format('woff2');
      font-weight: 900;
      font-style: normal;
    }
    .amgas-pdf-export-container,
    .amgas-pdf-export-container * {
      box-sizing: border-box !important;
      letter-spacing: normal !important;
      word-spacing: normal !important;
      -webkit-font-smoothing: antialiased !important;
    }
    .amgas-pdf-export-container div,
    .amgas-pdf-export-container span,
    .amgas-pdf-export-container p,
    .amgas-pdf-export-container h1,
    .amgas-pdf-export-container h2,
    .amgas-pdf-export-container h3,
    .amgas-pdf-export-container h4,
    .amgas-pdf-export-container th,
    .amgas-pdf-export-container td,
    .amgas-pdf-export-container label {
      letter-spacing: normal !important;
      word-spacing: normal !important;
      font-feature-settings: normal !important;
      text-rendering: geometricPrecision !important;
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, Tahoma, Arial, sans-serif !important;
    }
    .amgas-pdf-export-container .font-mono,
    .amgas-pdf-export-container [dir="ltr"],
    .amgas-pdf-export-container [data-numeric],
    .amgas-pdf-export-container td.numeric,
    .amgas-pdf-export-container .num-en {
      font-family: 'EnglishDigits', 'Vazirmatn', 'Segoe UI', Arial, Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "latn" 1, "tnum" 1 !important;
      letter-spacing: normal !important;
    }
    .amgas-pdf-export-container table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
    }
    .amgas-pdf-export-container th,
    .amgas-pdf-export-container td {
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      word-break: normal !important;
      box-sizing: border-box !important;
    }
    /* Kardex Specific Typography within PDF */
    .amgas-pdf-export-container #printable-gas-kardex {
      font-weight: 800 !important;
      color: #020617 !important;
    }
    .amgas-pdf-export-container .kardex-table th,
    .amgas-pdf-export-container .kardex-print-table th,
    .amgas-pdf-export-container #printable-gas-kardex th,
    .amgas-pdf-export-container #printable-production-kardex th {
      font-size: 12px !important;
      font-weight: 900 !important;
      line-height: 1.25 !important;
      padding: 3.5px 2px !important;
      color: #020617 !important;
    }
    .amgas-pdf-export-container .kardex-table td,
    .amgas-pdf-export-container .kardex-print-table td,
    .amgas-pdf-export-container #printable-gas-kardex td,
    .amgas-pdf-export-container #printable-production-kardex td {
      font-size: 12.5px !important;
      font-weight: 800 !important;
      line-height: 1.3 !important;
      padding: 3.5px 2px !important;
      color: #020617 !important;
    }
    .amgas-pdf-export-container #printable-gas-kardex tbody td:nth-child(3) {
      white-space: pre-line !important;
      overflow: visible !important;
      text-overflow: clip !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
      line-height: 1.35 !important;
      font-weight: 800 !important;
      text-align: center !important;
    }
    .amgas-pdf-export-container #printable-gas-kardex tbody td:nth-child(14) {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
      line-height: 1.3 !important;
      font-weight: 900 !important;
      text-align: center !important;
    }
    .amgas-pdf-export-container .kardex-table tfoot td,
    .amgas-pdf-export-container .kardex-print-table tfoot td,
    .amgas-pdf-export-container #printable-gas-kardex tfoot td,
    .amgas-pdf-export-container #printable-production-kardex tfoot td {
      font-size: 13px !important;
      font-weight: 900 !important;
      line-height: 1.3 !important;
      padding: 4px 2px !important;
      color: #020617 !important;
    }
    /* Receipt Specific Typography within PDF */
    .amgas-pdf-export-container .amgas-receipt-page th,
    .amgas-pdf-export-container #goods-entry-print-sheet th,
    .amgas-pdf-export-container #goods-exit-print-sheet th,
    .amgas-pdf-export-container #cylinder-inspection-official-sheet th {
      font-size: 12.5px !important;
      font-weight: 800 !important;
      padding: 5px 6px !important;
    }
    .amgas-pdf-export-container .amgas-receipt-page td,
    .amgas-pdf-export-container #goods-entry-print-sheet td,
    .amgas-pdf-export-container #goods-exit-print-sheet td,
    .amgas-pdf-export-container #cylinder-inspection-official-sheet td {
      font-size: 12.5px !important;
      font-weight: 700 !important;
      padding: 5px 6px !important;
    }
    /* Reports Typography within PDF */
    .amgas-pdf-export-container #printable-report-section,
    .amgas-pdf-export-container .amgas-report-page {
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    .amgas-pdf-export-container #printable-report-section *,
    .amgas-pdf-export-container .amgas-report-page * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .amgas-pdf-export-container #report-formal-header {
      border-bottom: 2px solid #000000 !important;
      padding-bottom: 8px !important;
      margin-bottom: 8px !important;
    }
    .amgas-pdf-export-container #report-formal-header div,
    .amgas-pdf-export-container #report-formal-header span {
      color: #000000 !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container #report-filter-summary {
      background-color: #f8fafc !important;
      border: 1.5px solid #475569 !important;
      color: #000000 !important;
      padding: 6px 10px !important;
      margin-bottom: 8px !important;
    }
    .amgas-pdf-export-container #report-filter-summary span {
      color: #000000 !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container #report-kpi-summary {
      margin-bottom: 8px !important;
    }
    .amgas-pdf-export-container #report-kpi-summary > div {
      background-color: #f8fafc !important;
      border: 1.5px solid #475569 !important;
      padding: 6px 8px !important;
      box-shadow: none !important;
    }
    .amgas-pdf-export-container #report-kpi-summary span {
      color: #0f172a !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container #report-kpi-summary div {
      font-weight: 900 !important;
    }
    .amgas-pdf-export-container #printable-report-section table,
    .amgas-pdf-export-container .amgas-report-page table {
      border: 1.5px solid #334155 !important;
      border-collapse: collapse !important;
      width: 100% !important;
    }
    .amgas-pdf-export-container #printable-report-section th,
    .amgas-pdf-export-container .amgas-report-page th {
      font-size: 12px !important;
      font-weight: 900 !important;
      padding: 6px 4px !important;
      background-color: #e2e8f0 !important;
      color: #000000 !important;
      border: 1px solid #64748b !important;
      line-height: 1.3 !important;
      vertical-align: middle !important;
    }
    .amgas-pdf-export-container #printable-report-section th.text-center,
    .amgas-pdf-export-container .amgas-report-page th.text-center {
      text-align: center !important;
    }
    .amgas-pdf-export-container #printable-report-section th:not(.text-center),
    .amgas-pdf-export-container .amgas-report-page th:not(.text-center) {
      text-align: right !important;
      padding-right: 8px !important;
    }
    .amgas-pdf-export-container #printable-report-section td,
    .amgas-pdf-export-container .amgas-report-page td {
      font-size: 12px !important;
      font-weight: 700 !important;
      padding: 5px 4px !important;
      color: #000000 !important;
      border: 1px solid #cbd5e1 !important;
      background-color: #ffffff !important;
      line-height: 1.4 !important;
      vertical-align: middle !important;
    }
    .amgas-pdf-export-container #printable-report-section td.text-center,
    .amgas-pdf-export-container .amgas-report-page td.text-center {
      text-align: center !important;
    }
    .amgas-pdf-export-container #printable-report-section td:not(.text-center):not([class*="text-left"]):not([class*="text-center"]),
    .amgas-pdf-export-container .amgas-report-page td:not(.text-center):not([class*="text-left"]):not([class*="text-center"]) {
      text-align: right !important;
      padding-right: 8px !important;
    }
    .amgas-pdf-export-container #printable-report-section td.text-left,
    .amgas-pdf-export-container .amgas-report-page td.text-left {
      text-align: left !important;
      padding-left: 8px !important;
    }
    .amgas-pdf-export-container #printable-report-section td *,
    .amgas-pdf-export-container .amgas-report-page td * {
      font-size: 12px !important;
      line-height: 1.4 !important;
    }
    /* CRITICAL: Strictly REMOVE all small boxes, pill borders, outlines and background cards around badges (نوع شیر, باقی‌مانده, وضعیت تراز, etc.) in PDF */
    .amgas-pdf-export-container #printable-report-section td span,
    .amgas-pdf-export-container #printable-report-section td div,
    .amgas-pdf-export-container .amgas-report-page td span,
    .amgas-pdf-export-container .amgas-report-page td div,
    .amgas-pdf-export-container td [class*="rounded"],
    .amgas-pdf-export-container td [class*="border"],
    .amgas-pdf-export-container td span[class*="rounded"],
    .amgas-pdf-export-container td span[class*="border"],
    .amgas-pdf-export-container td span.inline-flex,
    .amgas-pdf-export-container td div.inline-flex {
      border: none !important;
      border-width: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      background: transparent !important;
      background-color: transparent !important;
      padding: 0 !important;
      margin: 0 !important;
      display: inline !important;
      vertical-align: middle !important;
    }
    .amgas-pdf-export-container #printable-report-section tbody tr:nth-child(even) td,
    .amgas-pdf-export-container .amgas-report-page tbody tr:nth-child(even) td {
      background-color: #f8fafc !important;
    }
    /* Strictly remove green, emerald, and colored badge backgrounds from PDF reports (specifically customer valves) */
    .amgas-pdf-export-container [class*="bg-emerald"],
    .amgas-pdf-export-container [class*="bg-green"],
    .amgas-pdf-export-container [class*="bg-teal"],
    .amgas-pdf-export-container td[class*="bg-emerald"],
    .amgas-pdf-export-container th[class*="bg-emerald"],
    .amgas-pdf-export-container span[class*="bg-emerald"],
    .amgas-pdf-export-container div[class*="bg-emerald"],
    .amgas-pdf-export-container [class*="print:bg-emerald"] {
      background-color: transparent !important;
      background: none !important;
      background-image: none !important;
    }
    .amgas-pdf-export-container [class*="border-emerald"] {
      border-color: #cbd5e1 !important;
    }
    /* Deep rich high-contrast colors for values - crisp dark and legible on white paper */
    .amgas-pdf-export-container [class*="text-emerald"],
    .amgas-pdf-export-container .text-emerald-300,
    .amgas-pdf-export-container .text-emerald-400,
    .amgas-pdf-export-container .text-emerald-500 {
      color: #020617 !important;
      font-weight: 800 !important;
      background-color: transparent !important;
      background: none !important;
    }
    .amgas-pdf-export-container [class*="text-rose"],
    .amgas-pdf-export-container .text-rose-400,
    .amgas-pdf-export-container .text-rose-500 {
      color: #991b1b !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container [class*="text-amber"],
    .amgas-pdf-export-container .text-amber-400,
    .amgas-pdf-export-container .text-amber-500 {
      color: #78350f !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container [class*="text-indigo"],
    .amgas-pdf-export-container .text-indigo-300,
    .amgas-pdf-export-container .text-indigo-400 {
      color: #1e3a8a !important;
      font-weight: 800 !important;
    }
    .amgas-pdf-export-container [class*="text-slate-400"],
    .amgas-pdf-export-container [class*="text-slate-300"] {
      color: #1e293b !important;
      font-weight: 700 !important;
    }
    .amgas-pdf-export-container tfoot td {
      font-size: 12px !important;
      font-weight: 900 !important;
      padding: 6px 6px !important;
      background-color: #f1f5f9 !important;
      color: #000000 !important;
      border: 1px solid #cbd5e1 !important;
      border-top: 2px solid #000000 !important;
      border-bottom: 2px solid #000000 !important;
      vertical-align: middle !important;
    }
    .amgas-pdf-export-container tfoot td[colspan],
    .amgas-pdf-export-container tfoot td:first-child {
      text-align: right !important;
      padding-right: 12px !important;
    }
    .amgas-pdf-export-container #report-signatures-block {
      border-top: 2px solid #000000 !important;
      color: #000000 !important;
      font-weight: 800 !important;
      margin-top: 10px !important;
      padding-top: 8px !important;
    }
    .amgas-pdf-export-container #report-signatures-block div {
      color: #000000 !important;
      font-weight: 800 !important;
    }
  `;
  container.appendChild(isolationStyle);

  // 6. Ensure clone has full unconstrained dimensions
  clone.style.margin = '0 auto';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  clone.style.boxShadow = 'none';
  clone.style.width = '100%';
  clone.style.maxWidth = '100%';
  clone.style.boxSizing = 'border-box';

  // Ensure scrollable table containers expand to full width
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto').forEach(el => {
    el.style.overflow = 'visible';
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.boxSizing = 'border-box';
  });

  // Ensure tables strictly use fixed layout and fit 100% width without overflow
  clone.querySelectorAll<HTMLElement>('table').forEach(tbl => {
    tbl.style.width = '100%';
    tbl.style.maxWidth = '100%';
    tbl.style.minWidth = '0';
    tbl.style.tableLayout = 'fixed';
    tbl.style.boxSizing = 'border-box';
  });

  // Ensure report container switches from dark mode to crisp white paper
  if (clone.id === 'printable-report-section' || clone.querySelector('#printable-report-section')) {
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#020617';
    clone.querySelectorAll<HTMLElement>('[class*="bg-slate-900"], [class*="bg-slate-950"]').forEach(el => {
      el.style.backgroundColor = '#ffffff';
      el.style.color = '#020617';
      el.style.borderColor = '#cbd5e1';
    });
    clone.querySelectorAll<HTMLElement>('[class*="text-slate-100"], [class*="text-slate-200"], [class*="text-white"]').forEach(el => {
      el.style.color = '#020617';
    });
    // Strictly strip all green/emerald/teal backgrounds from all elements in reports for PDF
    clone.querySelectorAll<HTMLElement>(
      '[class*="bg-emerald"], [class*="bg-green"], [class*="bg-teal"], [class*="print:bg-emerald"], table span, table td, #report-kpi-summary div'
    ).forEach(el => {
      const cls = el.className || '';
      if (typeof cls === 'string' && (cls.includes('bg-emerald') || cls.includes('bg-green') || cls.includes('bg-teal') || cls.includes('print:bg-emerald'))) {
        el.style.backgroundColor = 'transparent';
        el.style.background = 'none';
        el.style.backgroundImage = 'none';
        el.style.borderColor = '#cbd5e1';
      }
      if (el.tagName === 'SPAN' && el.style.backgroundColor && el.style.backgroundColor !== '#ffffff' && el.style.backgroundColor !== 'transparent') {
        el.style.backgroundColor = 'transparent';
        el.style.background = 'none';
      }
    });
    // Strictly strip all small borders, boxes, pill frames, and backgrounds from spans/badges inside table cells for PDF
    clone.querySelectorAll<HTMLElement>('table td span, table td div').forEach(el => {
      el.style.border = 'none';
      el.style.borderWidth = '0';
      el.style.outline = 'none';
      el.style.boxShadow = 'none';
      el.style.borderRadius = '0';
      el.style.backgroundColor = 'transparent';
      el.style.background = 'none';
      el.style.padding = '0';
      el.style.margin = '0';
    });
    // Ensure all table th and td have vertical-align middle
    clone.querySelectorAll<HTMLElement>('table th, table td').forEach(el => {
      el.style.verticalAlign = 'middle';
    });
  }

  // 6b. Intelligent Multi-Page Report Pagination
  // When a report table has rows that exceed Page 1, split into discrete A4 landscape pages,
  // repeating the formal header (with logo, date, and page number) and table <thead> on EVERY page.
  const reportSection = clone.id === 'printable-report-section'
    ? clone
    : clone.querySelector<HTMLElement>('#printable-report-section');

  if (reportSection) {
    const formalHeader = reportSection.querySelector<HTMLElement>('#report-formal-header');
    const filterSummary = reportSection.querySelector<HTMLElement>('#report-filter-summary');
    const kpiSummary = reportSection.querySelector<HTMLElement>('#report-kpi-summary');
    const signaturesBlock = reportSection.querySelector<HTMLElement>('#report-signatures-block');
    const table = reportSection.querySelector<HTMLElement>('table');

    if (formalHeader && table) {
      const colgroup = table.querySelector('colgroup');
      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');
      const tfoot = table.querySelector('tfoot');
      const allRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];

      // Determine page capacity:
      // Page 1 has header and filter summary; intermediate pages have header only.
      const hasKpi = Boolean(kpiSummary);
      const firstPageLimit = hasKpi ? 8 : 11;
      const subsequentPageLimit = 13;

      if (allRows.length > firstPageLimit) {
        const pageRowSlices: HTMLTableRowElement[][] = [];
        let remaining = [...allRows];

        // First page rows
        pageRowSlices.push(remaining.slice(0, firstPageLimit));
        remaining = remaining.slice(firstPageLimit);

        // Subsequent page rows
        while (remaining.length > 0) {
          const takeCount = Math.min(subsequentPageLimit, remaining.length);
          pageRowSlices.push(remaining.slice(0, takeCount));
          remaining = remaining.slice(takeCount);
        }

        const totalPages = pageRowSlices.length;
        const pagesContainer = document.createElement('div');
        pagesContainer.className = 'amgas-report-multipage-container';

        pageRowSlices.forEach((rowsSlice, pageIdx) => {
          const pageDiv = document.createElement('div');
          pageDiv.className = 'amgas-report-page';
          pageDiv.style.width = '100%';
          pageDiv.style.backgroundColor = '#ffffff';
          pageDiv.style.boxSizing = 'border-box';
          pageDiv.style.padding = '14px 18px';
          pageDiv.style.display = 'flex';
          pageDiv.style.flexDirection = 'column';
          pageDiv.style.justifyContent = 'space-between';
          pageDiv.style.minHeight = '720px';
          pageDiv.style.maxHeight = '745px';
          pageDiv.style.marginBottom = pageIdx < totalPages - 1 ? '16px' : '0';

          const topSection = document.createElement('div');
          topSection.style.display = 'flex';
          topSection.style.flexDirection = 'column';
          topSection.style.gap = '8px';

          // Clone Formal Header
          const pageHeader = formalHeader.cloneNode(true) as HTMLElement;
          pageHeader.id = `report-formal-header-p${pageIdx + 1}`;

          // Append page indicator to the header metadata
          const metaCol = pageHeader.querySelector('.text-right, .sm\\:text-left, [class*="space-y-1"]');
          if (metaCol) {
            const pagePill = document.createElement('div');
            pagePill.className = 'font-black text-slate-900 border border-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] inline-block';
            pagePill.textContent = `صفحه ${toEnglishDigits(pageIdx + 1)} از ${toEnglishDigits(totalPages)}`;
            metaCol.appendChild(pagePill);
          }
          topSection.appendChild(pageHeader);

          // Add Filter and KPI summary only to Page 1
          if (pageIdx === 0) {
            if (filterSummary) {
              topSection.appendChild(filterSummary.cloneNode(true));
            }
            if (kpiSummary) {
              topSection.appendChild(kpiSummary.cloneNode(true));
            }
          }

          // Build Table for this page
          const pageTable = document.createElement('table');
          pageTable.className = table.className;
          pageTable.style.width = '100%';
          pageTable.style.tableLayout = 'fixed';
          pageTable.style.borderCollapse = 'collapse';

          if (colgroup) {
            pageTable.appendChild(colgroup.cloneNode(true));
          }
          if (thead) {
            pageTable.appendChild(thead.cloneNode(true)); // Column headers repeat on every page!
          }

          const pageTbody = document.createElement('tbody');
          pageTbody.className = tbody ? tbody.className : '';
          rowsSlice.forEach(r => {
            pageTbody.appendChild(r.cloneNode(true));
          });
          pageTable.appendChild(pageTbody);

          topSection.appendChild(pageTable);
          pageDiv.appendChild(topSection);

          // Bottom section:
          if (pageIdx === totalPages - 1) {
            // Last page gets totals row + formal signatures
            const bottomSection = document.createElement('div');
            bottomSection.style.marginTop = 'auto';

            if (tfoot) {
              pageTable.appendChild(tfoot.cloneNode(true));
            }

            if (signaturesBlock) {
              bottomSection.appendChild(signaturesBlock.cloneNode(true));
            }
            pageDiv.appendChild(bottomSection);
          } else {
            // Intermediate pages get continuation note
            const continuationNote = document.createElement('div');
            continuationNote.className = 'text-left text-[10px] text-slate-600 font-bold pt-1.5 border-t border-slate-300';
            continuationNote.textContent = `ادامه گزارش در صفحه بعد (صفحه ${toEnglishDigits(pageIdx + 2)})...`;
            pageDiv.appendChild(continuationNote);
          }

          pagesContainer.appendChild(pageDiv);
        });

        // Replace content with paginated structure
        reportSection.innerHTML = '';
        reportSection.appendChild(pagesContainer);
      }
    }
  }

  container.appendChild(clone);
  document.body.appendChild(container);

  // 7. Inline images as base64 Data URLs so canvas is NEVER tainted
  const imgElements = Array.from(clone.querySelectorAll('img'));
  await Promise.all(imgElements.map(async (img) => {
    try {
      if (img.src && !img.src.startsWith('data:')) {
        const response = await fetch(img.src);
        const blob = await response.blob();
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              img.src = reader.result;
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // Continue even if an image cannot be inlined
    }
  }));

  try {
    const isEntryReceipt = clone.id === 'goods-entry-print-sheet' || clone.querySelector('#goods-entry-print-sheet') !== null || clone.classList.contains('amgas-entry-page') || clone.querySelector('.amgas-entry-page') !== null;
    const isExitReceipt = clone.id === 'goods-exit-print-sheet' || clone.querySelector('#goods-exit-print-sheet') !== null || clone.classList.contains('amgas-exit-page') || clone.querySelector('.amgas-exit-page') !== null;
    const defaultBg = isEntryReceipt ? '#fdfbe8' : isExitReceipt ? '#fcfbf7' : '#ffffff';

    const pageWidthMm = paperDims.width;
    const pageHeightMm = paperDims.height;
    const printableWidthMm = pageWidthMm - (marginMm * 2);
    const printableHeightMm = pageHeightMm - (marginMm * 2);

    // 8. Multi-page Handling (Dedicated discrete pages for slips and reports)
    const discretePages = Array.from(clone.querySelectorAll<HTMLElement>('.amgas-receipt-page, .amgas-report-page'));
    if (discretePages.length > 1) {
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format,
        compress: true
      });

      for (let pIdx = 0; pIdx < discretePages.length; pIdx++) {
        if (pIdx > 0) {
          pdf.addPage(format, orientation);
        }

        const pageEl = discretePages[pIdx];
        const isReceipt = pageEl.classList.contains('amgas-receipt-page');
        const pageBgColor = isReceipt ? (isEntryReceipt ? '#fdfbe8' : isExitReceipt ? '#fcfbf7' : '#ffffff') : '#ffffff';

        if (isReceipt) {
          const pageBorder = isEntryReceipt ? '2px dashed #b45309' : isExitReceipt ? '2px dashed #0284c7' : 'none';
          pageEl.style.backgroundColor = pageBgColor;
          pageEl.style.border = pageBorder;
          pageEl.style.borderRadius = '6px';
          pageEl.style.padding = '12px 16px';
          pageEl.style.boxSizing = 'border-box';
          pageEl.style.boxShadow = 'none';
        }

        const pCanvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: pageBgColor,
          logging: false,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('*').forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (htmlEl.style) {
                htmlEl.style.letterSpacing = 'normal';
                htmlEl.style.wordSpacing = 'normal';
              }
            });
          }
        });

        const pImgData = pCanvas.toDataURL('image/png', 1.0);
        const pAspect = pCanvas.width / pCanvas.height;
        let rWidth = printableWidthMm;
        let rHeight = printableWidthMm / pAspect;

        if (rHeight > printableHeightMm) {
          rHeight = printableHeightMm;
          rWidth = printableHeightMm * pAspect;
        }

        const posX = marginMm + (printableWidthMm - rWidth) / 2;
        const posY = marginMm + (printableHeightMm - rHeight) / 2;

        pdf.addImage(pImgData, 'PNG', posX, posY, rWidth, rHeight, undefined, 'FAST');
      }

      const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      pdf.save(cleanFilename);
      return true;
    }

    // 9. Render Clone with html2canvas
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: defaultBg,
      logging: false,
      windowWidth: renderWidthPx,
      windowHeight: container.scrollHeight,
      onclone: (clonedDoc) => {
        // Enforce normal letter-spacing and preserve Persian cursive ligatures
        clonedDoc.querySelectorAll('*').forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.style) {
            htmlEl.style.letterSpacing = 'normal';
            htmlEl.style.wordSpacing = 'normal';
          }
        });
      }
    });

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format,
      compress: true
    });

    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;
    const imgAspectRatio = imgWidthPx / imgHeightPx;
    const totalHeightMm = printableWidthMm / imgAspectRatio;

    // 10. Single-page fitting
    if (format === 'a5' || totalHeightMm <= printableHeightMm + 2) {
      let renderWidthMm = printableWidthMm;
      let renderHeightMm = totalHeightMm;

      if (renderHeightMm > printableHeightMm) {
        renderHeightMm = printableHeightMm;
        renderWidthMm = renderHeightMm * imgAspectRatio;
      }

      const posX = marginMm + (printableWidthMm - renderWidthMm) / 2;
      const posY = marginMm + Math.max(0, (printableHeightMm - renderHeightMm) / 2);

      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', posX, posY, renderWidthMm, renderHeightMm, undefined, 'FAST');
    } else {
      // 11. Multi-page discrete slicing:
      // Slices the source canvas into page-sized blocks.
      // NEVER extends past printableHeightMm or bleeds outside A4 boundaries!
      const pageSliceHeightPx = Math.floor(canvas.width * (printableHeightMm / printableWidthMm));
      let currentYPx = 0;
      let pageNum = 0;

      while (currentYPx < canvas.height) {
        if (pageNum > 0) {
          pdf.addPage(format, orientation);
        }

        const remainingPx = canvas.height - currentYPx;
        const sliceHeightPx = Math.min(pageSliceHeightPx, remainingPx);

        // Create discrete slice canvas
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;

        const sliceCtx = sliceCanvas.getContext('2d');
        if (sliceCtx) {
          sliceCtx.fillStyle = defaultBg;
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceCtx.drawImage(
            canvas,
            0,
            currentYPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
        }

        const sliceImgData = sliceCanvas.toDataURL('image/png', 1.0);
        const sliceHeightMm = printableWidthMm * (sliceHeightPx / canvas.width);

        pdf.addImage(
          sliceImgData,
          'PNG',
          marginMm,
          marginMm,
          printableWidthMm,
          sliceHeightMm,
          undefined,
          'FAST'
        );

        currentYPx += sliceHeightPx;
        pageNum++;
      }
    }

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(cleanFilename);
    return true;
  } catch (err) {
    console.warn('[PdfExport] Direct canvas PDF generation error, triggering browser print fallback:', err);
    printReceiptSheet({
      elementId: typeof elementIdOrElement === 'string' ? elementIdOrElement : targetElement.id || 'am-gas-fallback-print',
      title: filename.replace('.pdf', ''),
      paperSize: format.toUpperCase() as 'A4' | 'A5',
      orientation
    });
    return false;
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
