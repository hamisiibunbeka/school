import InvoiceDocumentView from './document';
import { PAPER_HEIGHT_MM, PAPER_WIDTH_MM, type InvoiceData, type Layout } from './schema';

const MM = 3.7795; // CSS px per mm

/** A scaled-down, non-interactive render of a layout (gallery cards). */
export default function LayoutThumbnail({ layout, data, width = 260 }: { layout: Layout; data: InvoiceData; width?: number }) {
    const pageWidth = PAPER_WIDTH_MM[layout.page.paper] * MM;
    const pageHeight = PAPER_HEIGHT_MM[layout.page.paper] * MM;
    const scale = width / pageWidth;

    return (
        <div className="pointer-events-none overflow-hidden bg-white select-none" style={{ width, height: Math.min(pageHeight, PAPER_WIDTH_MM.A4 * MM * 1.414) * scale }} aria-hidden>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: pageWidth }}>
                <InvoiceDocumentView layout={layout} data={data} className="shadow-none!" />
            </div>
        </div>
    );
}
