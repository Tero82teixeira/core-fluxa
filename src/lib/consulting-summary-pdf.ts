import { jsPDF } from "jspdf";
import type { ConsultingSummaryDocument } from "./consulting-summary.ts";

/** Text-only PDF, generated locally. Long paragraphs and deliveries flow across A4 pages. */
export function createConsultingSummaryPdf(content: ConsultingSummaryDocument, fontBase64: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("DejaVuSans.ttf", fontBase64);
  pdf.addFont("DejaVuSans.ttf", "Fluxa", "normal");
  pdf.setFont("Fluxa", "normal");
  pdf.setProperties({ title: content.title, author: "FLUXA", subject: content.reference });
  const width = 174;
  let y = 24;
  const page = () => {
    pdf.addPage();
    y = 24;
  };
  const text = (value: string, size = 10, gap = 3, heading = false) => {
    pdf.setFontSize(size);
    if (heading) pdf.setTextColor(57, 47, 121);
    else pdf.setTextColor(35, 42, 55);
    // PDF text is never interpreted as HTML. Preserve line breaks; remove control characters.
    const clean = Array.from(value)
      .filter((char) => char === "\n" || char.charCodeAt(0) >= 32)
      .join("");
    const lines = pdf.splitTextToSize(clean, width) as string[];
    const lineHeight = size * 0.3528 * 1.5;
    if (heading && y + lineHeight + 12 > 273) page();
    for (const line of lines) {
      if (y + lineHeight > 273) page();
      pdf.text(line, 18, y);
      y += lineHeight;
    }
    y += gap;
  };
  text("FLUXA", 10, 5, true);
  text(content.title, 21, 5, true);
  text(content.reference, 9);
  text(content.notice, 9, 5);
  text(content.progress, 11, 3, true);
  text(content.statusHint, 9, 6);
  for (const section of content.sections) {
    text(section.title, 13, 4, true);
    for (const line of section.lines) text(line);
    y += 4;
  }
  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index);
    pdf.setDrawColor(220, 222, 228);
    pdf.line(18, 280, 192, 280);
    pdf.setFontSize(8);
    pdf.setTextColor(90, 96, 108);
    pdf.text(`FLUXA  |  ${index} / ${pages}`, 18, 286);
  }
  return pdf;
}
