import fontUrl from "@/assets/DejaVuSans.ttf?url";
import { createConsultingSummaryPdf } from "./consulting-summary-pdf";
import type { ConsultingSummaryDocument } from "./consulting-summary";

export async function downloadConsultingSummary(
  content: ConsultingSummaryDocument,
  code: string,
  date: string,
) {
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error("PDF_FONT_UNAVAILABLE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const pdf = createConsultingSummaryPdf(content, btoa(binary));
  const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "projeto";
  // jsPDF uses FileSaver for browser/mobile download; no print dialog or popup dependency.
  await pdf.save(`fluxa-consultoria-${safeCode}-${date}.pdf`, { returnPromise: true });
}
