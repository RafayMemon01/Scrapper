// ============================================================
// REPORT GENERATOR - Creates branded .docx audit reports
// Called by: POST /generate/report with Claude's audit JSON
// Returns: .docx file as binary download
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} from "docx";

// Koretechx brand colors
const PRIMARY = "0F4C81";
const ACCENT = "E94560";
const DARK = "1A1A2E";
const GREEN = "10B981";
const AMBER = "F59E0B";
const RED = "EF4444";
const LIGHT_BG = "F0F4F8";
const WHITE = "FFFFFF";
const GRAY = "666666";
const BORDER_CLR = "CCCCCC";

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function scoreColor(score) {
  if (score >= 8) return GREEN;
  if (score >= 5) return AMBER;
  return RED;
}

function scoreLabel(score) {
  if (score >= 8) return "Strong";
  if (score >= 5) return "Needs Improvement";
  return "Critical Gap";
}

function priorityColor(priority) {
  if (priority === "high") return RED;
  if (priority === "medium") return AMBER;
  return GREEN;
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun(text)] });
}

function text(content, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after || 120 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text: content, size: opts.size || 22, font: "Arial", ...opts })],
  });
}

function boldText(label, value) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 22, font: "Arial" }),
      new TextRun({ text: value, size: 22, font: "Arial" }),
    ],
  });
}

function bulletItem(content, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text: content, size: 22, font: "Arial" })],
  });
}

function spacer(height = 200) {
  return new Paragraph({ spacing: { before: height }, children: [] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 1 } },
    children: [],
  });
}

function headerCell(txt, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text: txt, bold: true, color: WHITE, size: 20, font: "Arial" })] })],
  });
}

function dataCell(txt, width, fill = null) {
  const opts = {
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text: String(txt), size: 20, font: "Arial" })] })],
  };
  if (fill) opts.shading = { fill, type: ShadingType.CLEAR };
  return new TableCell(opts);
}

function scoreBadgeCell(score, width) {
  const color = scoreColor(score);
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: color, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${score}/10`, bold: true, color: WHITE, size: 22, font: "Arial" })],
    })],
  });
}

export async function generateReport(auditData) {
  const audit = auditData;
  const companyName = audit.lead?.companyName || "Unknown Company";
  const websiteUrl = audit.lead?.websiteUrl || "";
  const auditDate = audit.lead?.auditDate || new Date().toISOString().split("T")[0];
  const overallScore = audit.overallScore || 0;
  const sections = audit.sections || [];
  const quickWins = audit.quickWins || [];
  const services = audit.recommendedServices || [];
  const competitorInsights = audit.competitorInsights || "";
  const executiveSummary = audit.executiveSummary || "";

  // Build sections content
  const sectionContent = [];
  for (const section of sections) {
    sectionContent.push(
      divider(),
      heading(section.title, HeadingLevel.HEADING_2),
      // Score row
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 1500, 5860],
        rows: [
          new TableRow({
            children: [
              dataCell("Score:", 2000),
              scoreBadgeCell(section.score, 1500),
              dataCell(`${scoreLabel(section.score)} | Priority: ${(section.priority || "medium").toUpperCase()}`, 5860,
                section.priority === "high" ? "FEE2E2" : section.priority === "medium" ? "FEF3C7" : LIGHT_BG),
            ],
          }),
        ],
      }),
      spacer(100),
    );

    // Findings
    if (section.findings && section.findings.length > 0) {
      sectionContent.push(
        text("Key Findings:", { bold: true, color: DARK }),
      );
      for (const finding of section.findings) {
        sectionContent.push(bulletItem(finding, "findings"));
      }
    }

    // Opportunities
    if (section.opportunities && section.opportunities.length > 0) {
      sectionContent.push(
        spacer(80),
        text("Opportunities:", { bold: true, color: PRIMARY }),
      );
      for (const opp of section.opportunities) {
        sectionContent.push(bulletItem(opp, "opportunities"));
      }
    }
  }

  // Build document
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: PRIMARY },
          paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: DARK },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "findings",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "opportunities",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u25CB", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "numbers",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [
      // ===== COVER PAGE =====
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          spacer(2500),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "KORETECHX DIGITAL", size: 28, bold: true, font: "Arial", color: PRIMARY, characterSpacing: 200 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 8 } },
            children: [],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: "Digital Presence Audit Report", size: 48, bold: true, font: "Arial", color: DARK })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: companyName, size: 36, font: "Arial", color: PRIMARY })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: websiteUrl, size: 24, font: "Arial", color: GRAY })],
          }),
          spacer(1500),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Prepared by Koretechx Digital  |  ${auditDate}`, size: 20, font: "Arial", color: GRAY })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
            children: [new TextRun({ text: "Confidential", size: 18, font: "Arial", color: GRAY, italics: true })],
          }),
        ],
      },

      // ===== MAIN CONTENT =====
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `${companyName}  |  Digital Audit Report`, size: 16, font: "Arial", color: "999999" })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Koretechx Digital  |  Page ", size: 16, font: "Arial", color: "999999" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: "999999" }),
              ],
            })],
          }),
        },
        children: [
          // ===== EXECUTIVE SUMMARY =====
          heading("Executive Summary"),

          // Overall score
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [3120, 3120, 3120],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    width: { size: 3120, type: WidthType.DXA },
                    shading: { fill: scoreColor(overallScore >= 80 ? 8 : overallScore >= 50 ? 5 : 3), type: ShadingType.CLEAR },
                    margins: { top: 200, bottom: 200, left: 120, right: 120 },
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "OVERALL SCORE", size: 18, bold: true, color: WHITE, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${overallScore}`, size: 56, bold: true, color: WHITE, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "out of 100", size: 18, color: WHITE, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    borders,
                    width: { size: 3120, type: WidthType.DXA },
                    margins: cellMargins,
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Sections Audited", bold: true, size: 20, font: "Arial", color: DARK })] }),
                      ...sections.map(s => new Paragraph({
                        spacing: { after: 40 },
                        children: [
                          new TextRun({ text: `${s.score}/10 `, bold: true, size: 18, font: "Arial", color: scoreColor(s.score) }),
                          new TextRun({ text: s.title, size: 18, font: "Arial" }),
                        ],
                      })),
                    ],
                  }),
                  new TableCell({
                    borders,
                    width: { size: 3120, type: WidthType.DXA },
                    margins: cellMargins,
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Quick Wins", bold: true, size: 20, font: "Arial", color: DARK })] }),
                      ...quickWins.slice(0, 3).map((qw, i) => new Paragraph({
                        spacing: { after: 40 },
                        children: [new TextRun({ text: `${i + 1}. ${qw.title}`, size: 18, font: "Arial" })],
                      })),
                    ],
                  }),
                ],
              }),
            ],
          }),

          spacer(200),
          text(executiveSummary),

          // ===== SECTION-BY-SECTION =====
          ...sectionContent,

          // ===== QUICK WINS =====
          divider(),
          heading("Top Quick Wins"),
          text("These are high-impact, low-effort improvements that can deliver fast results:"),

          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2500, 5360, 1500],
            rows: [
              new TableRow({
                children: [
                  headerCell("Quick Win", 2500),
                  headerCell("Description", 5360),
                  headerCell("Effort", 1500),
                ],
              }),
              ...quickWins.map((qw, i) => new TableRow({
                children: [
                  dataCell(qw.title, 2500, i % 2 === 1 ? LIGHT_BG : null),
                  dataCell(qw.description, 5360, i % 2 === 1 ? LIGHT_BG : null),
                  dataCell((qw.effort || "medium").toUpperCase(), 1500, i % 2 === 1 ? LIGHT_BG : null),
                ],
              })),
            ],
          }),

          // ===== RECOMMENDED SERVICES =====
          divider(),
          heading("Recommended Koretechx Services"),
          text("Based on the audit findings, we recommend the following services to address identified gaps and opportunities:"),

          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2200, 5660, 1500],
            rows: [
              new TableRow({
                children: [
                  headerCell("Service", 2200),
                  headerCell("Why This Matters", 5660),
                  headerCell("Impact", 1500),
                ],
              }),
              ...services.map((svc, i) => new TableRow({
                children: [
                  dataCell(svc.service, 2200, i % 2 === 1 ? LIGHT_BG : null),
                  dataCell(svc.rationale, 5660, i % 2 === 1 ? LIGHT_BG : null),
                  dataCell((svc.impact || "medium").toUpperCase(), 1500, i % 2 === 1 ? LIGHT_BG : null),
                ],
              })),
            ],
          }),

          // ===== COMPETITOR INSIGHTS =====
          ...(competitorInsights ? [
            divider(),
            heading("Competitive Landscape", HeadingLevel.HEADING_2),
            text(competitorInsights),
          ] : []),

          // ===== NEXT STEPS / CTA =====
          divider(),
          heading("Next Steps"),
          text("We would love to discuss these findings with you and show you how Koretechx Digital can help transform your digital presence."),
          spacer(200),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    width: { size: 9360, type: WidthType.DXA },
                    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
                    margins: { top: 200, bottom: 200, left: 300, right: 300 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 100 },
                        children: [new TextRun({ text: "Ready to Grow Your Digital Presence?", size: 28, bold: true, color: WHITE, font: "Arial" })],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 80 },
                        children: [new TextRun({ text: "Contact Jerry Long", size: 22, color: WHITE, font: "Arial" })],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 80 },
                        children: [new TextRun({ text: "jerry@koretechx.com", size: 22, bold: true, color: WHITE, font: "Arial" })],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: "www.koretechx.com", size: 20, color: WHITE, font: "Arial" })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          spacer(400),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "This report was generated by Koretechx Digital's AI audit system.", size: 16, font: "Arial", color: "999999", italics: true })],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}