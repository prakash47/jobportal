import PDFDocument from 'pdfkit';
import { amountInWords, formatInrFromPaise } from './gst';

// GST tax-invoice PDF (CGST Rule 46 fields: supplier identity + GSTIN,
// consecutive invoice number + date, buyer identity (+ GSTIN when registered),
// place of supply, SAC, taxable value, tax rate + CGST/SGST/IGST split, total,
// total in words). Rendered with pdfkit's built-in Helvetica — those fonts
// carry no U+20B9 (₹) glyph, so every amount uses the "INR " prefix.
// E-invoicing (IRN + QR) applies only above ₹5Cr turnover — layout leaves the
// footer free for it later.

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  seller: {
    name: string;
    address: string;
    gstin: string;
    state: string;
    sacCode: string;
  };
  buyer: {
    legalName: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    pincode: string;
    gstin: string | null;
  };
  planName: string;
  periodStart: Date;
  periodEnd: Date;
  taxableInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  gstRateBps: number;
  totalInPaise: number;
}

const GRAY = '#555555';
const LINE = '#cccccc';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inr(paise: number): string {
  return formatInrFromPaise(paise, 'INR ');
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${data.invoiceNumber}`, Author: data.seller.name },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header
    doc.font('Helvetica-Bold').fontSize(18).text('TAX INVOICE', left, 50);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(GRAY)
      .text(`Invoice no: ${data.invoiceNumber}`, left, 54, { align: 'right', width })
      .text(`Invoice date: ${fmtDate(data.issuedAt)}`, { align: 'right', width });

    doc.moveTo(left, 90).lineTo(right, 90).strokeColor(LINE).stroke();

    // Seller / buyer blocks
    const blockTop = 104;
    doc.fillColor('black').font('Helvetica-Bold').fontSize(10).text('Sold by', left, blockTop);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(data.seller.name, left, blockTop + 16, { width: width / 2 - 12 })
      .fillColor(GRAY)
      .text(data.seller.address, { width: width / 2 - 12 })
      .text(`GSTIN: ${data.seller.gstin || '—'}`)
      .text(`State: ${data.seller.state}`);

    const rightColX = left + width / 2 + 12;
    doc.fillColor('black').font('Helvetica-Bold').fontSize(10).text('Billed to', rightColX, blockTop);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(data.buyer.legalName, rightColX, blockTop + 16, { width: width / 2 - 12 });
    doc.fillColor(GRAY).text(data.buyer.addressLine1, { width: width / 2 - 12 });
    if (data.buyer.addressLine2) doc.text(data.buyer.addressLine2, { width: width / 2 - 12 });
    doc.text(`${data.buyer.city}, ${data.buyer.state} ${data.buyer.pincode}`, {
      width: width / 2 - 12,
    });
    doc.text(`GSTIN: ${data.buyer.gstin ?? 'Unregistered'}`);

    let y = Math.max(doc.y, blockTop + 96) + 16;
    doc
      .fillColor(GRAY)
      .fontSize(10)
      .text(`Place of supply: ${data.buyer.state}`, left, y)
      .text(`SAC: ${data.seller.sacCode}`, left, y + 14);

    // Line item table
    y += 44;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
    y += 8;
    const amountColW = 110;
    doc.fillColor('black').font('Helvetica-Bold').fontSize(10);
    doc.text('Description', left, y, { width: width - amountColW });
    doc.text('Amount', right - amountColW, y, { width: amountColW, align: 'right' });
    y += 18;
    doc.font('Helvetica').fontSize(10);
    doc.text(
      `${data.planName} — subscription (${fmtDate(data.periodStart)} to ${fmtDate(data.periodEnd)})`,
      left,
      y,
      { width: width - amountColW },
    );
    doc.text(inr(data.taxableInPaise), right - amountColW, y, {
      width: amountColW,
      align: 'right',
    });
    y = doc.y + 12;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
    y += 10;

    // Tax summary (right-aligned rows)
    const ratePct = data.gstRateBps / 100;
    const rows: Array<[string, string]> = [['Taxable value', inr(data.taxableInPaise)]];
    if (data.igstInPaise > 0) {
      rows.push([`IGST @ ${ratePct}%`, inr(data.igstInPaise)]);
    } else {
      rows.push([`CGST @ ${ratePct / 2}%`, inr(data.cgstInPaise)]);
      rows.push([`SGST @ ${ratePct / 2}%`, inr(data.sgstInPaise)]);
    }
    for (const [label, value] of rows) {
      doc.fillColor(GRAY).text(label, left, y, { width: width - amountColW });
      doc.fillColor('black').text(value, right - amountColW, y, {
        width: amountColW,
        align: 'right',
      });
      y += 16;
    }
    doc.font('Helvetica-Bold');
    doc.fillColor('black').text('Total', left, y, { width: width - amountColW });
    doc.text(inr(data.totalInPaise), right - amountColW, y, { width: amountColW, align: 'right' });
    y += 24;

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(GRAY)
      .text(`Amount in words: ${amountInWords(data.totalInPaise)}`, left, y, { width });

    // Footer
    doc
      .fontSize(8)
      .fillColor(GRAY)
      .text(
        'This is a computer-generated invoice and does not require a signature.',
        left,
        doc.page.height - doc.page.margins.bottom - 24,
        { width, align: 'center' },
      );

    doc.end();
  });
}
