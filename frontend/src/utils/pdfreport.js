const BRAND = [12, 38, 54];
const PRIMARY = [13, 110, 253];
const TEXT = [33, 37, 41];
const MUTED = [108, 117, 125];
const DIVIDER = [222, 226, 230];

/**
 * Builds and downloads a simple, text-based climate report.
 *
 * sections: [{ title, rows: [[label, value], ...] }] for key/value tables,
 *        or [{ title, items: ["...", ...] }] for bullet lists.
 */
export async function generateClimateReport({ fileName, title, preparedFor, location, sections }) {
  // Loaded on demand so the PDF library isn't part of the main bundle for every visitor
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 22) {
      doc.addPage();
      y = 22;
    }
  };

  const drawSectionTitle = (text) => {
    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND);
    doc.text(text, margin, y);
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.8);
    doc.line(margin, y + 2, margin + 14, y + 2);
    y += 9;
  };

  const drawRow = (label, value) => {
    ensureSpace(8);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT);
    doc.text(String(value ?? "--"), pageWidth - margin, y, { align: "right" });
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 2.5, pageWidth - margin, y + 2.5);
    y += 8;
  };

  const drawBullet = (text) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(text, contentWidth - 6);
    ensureSpace(lines.length * 5 + 2);
    doc.setFillColor(...PRIMARY);
    doc.circle(margin + 1.2, y - 1.2, 0.8, "F");
    doc.text(lines, margin + 5, y);
    y += lines.length * 5 + 2;
  };

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, margin, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Climate Impact Visualizer", margin, 26);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin, 26, { align: "right" });
  y = 48;

  // Location summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...TEXT);
  const nameLines = doc.splitTextToSize(location.name, contentWidth);
  doc.text(nameLines, margin, y);
  y += nameLines.length * 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Coordinates: ${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`, margin, y);
  y += 5;
  if (preparedFor) {
    doc.text(`Prepared for: ${preparedFor}`, margin, y);
    y += 5;
  }
  y += 8;

  sections.forEach((section) => {
    drawSectionTitle(section.title);
    section.rows?.forEach(([label, value]) => drawRow(label, value));
    section.items?.forEach((item) => drawBullet(item));
    y += 6;
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      "Figures are model estimates. Verify against official sources before making critical decisions.",
      margin,
      pageHeight - 10
    );
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  }

  doc.save(fileName);
}
