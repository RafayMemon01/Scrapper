// ============================================================
// REPORT GENERATOR v2.0 - Visually Enhanced Branded Audit Report
// Improvements: score bars, metric cards, GMB section,
// social media table, two-column findings/opportunities layout
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, VerticalAlign
} from "docx";

// ============================================================
// BRAND COLORS
// ============================================================
const PRIMARY    = "0F4C81";
const ACCENT     = "E94560";
const DARK       = "1A1A2E";
const GREEN      = "10B981";
const AMBER      = "F59E0B";
const RED        = "EF4444";
const LIGHT_BG   = "F0F4F8";
const WHITE      = "FFFFFF";
const GRAY       = "666666";
const LIGHT_GRAY = "E5E7EB";
const BLUE_TINT  = "EFF6FF";

// ============================================================
// BORDER PRESETS
// ============================================================
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorders = {
  top:    { style: BorderStyle.NONE, size: 0, color: WHITE },
  bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
  left:   { style: BorderStyle.NONE, size: 0, color: WHITE },
  right:  { style: BorderStyle.NONE, size: 0, color: WHITE },
};
const cellMargins      = { top: 80,  bottom: 80,  left: 120, right: 120 };
const tallCellMargins  = { top: 160, bottom: 160, left: 200, right: 200 };

// ============================================================
// SCORE HELPERS
// ============================================================
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

function priorityBg(priority) {
  if (priority === "high")   return "FEE2E2";
  if (priority === "medium") return "FEF3C7";
  return "ECFDF5";
}

function priorityFg(priority) {
  if (priority === "high")   return RED;
  if (priority === "medium") return "D97706";
  return "059669";
}

// ============================================================
// BASE ELEMENTS
// ============================================================
function spacer(height = 200) {
  return new Paragraph({ spacing: { before: height }, children: [] });
}

function divider(color = PRIMARY) {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color, space: 1 } },
    children: [],
  });
}

function para(content, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 100, before: opts.before ?? 0 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text: content,
      size:   opts.size   || 22,
      font:   "Arial",
      bold:   opts.bold   || false,
      italic: opts.italic || false,
      color:  opts.color  || DARK,
    })],
  });
}

function bulletItem(content, ref = "bullets", color = DARK) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text: content, size: 21, font: "Arial", color })],
  });
}

// ============================================================
// SCORE PROGRESS BAR
// 10-cell horizontal bar, colored cells = score, gray = remaining
// ============================================================
function scoreBar(score, totalWidth = 9360) {
  const filled = Math.min(10, Math.max(0, Math.round(score)));
  const empty   = 10 - filled;
  const cellW   = Math.floor(totalWidth / 10);
  const extra   = totalWidth - cellW * 10; // remainder added to last filled cell
  const color   = scoreColor(score);

  const filledCells = Array.from({ length: filled }, (_, i) =>
    new TableCell({
      borders,
      width: { size: cellW + (i === filled - 1 ? extra : 0), type: WidthType.DXA },
      shading: { fill: color, type: ShadingType.CLEAR },
      margins: { top: 55, bottom: 55, left: 0, right: 0 },
      children: [new Paragraph({ children: [] })],
    })
  );

  const emptyCells = Array.from({ length: empty }, () =>
    new TableCell({
      borders,
      width: { size: cellW, type: WidthType.DXA },
      shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
      margins: { top: 55, bottom: 55, left: 0, right: 0 },
      children: [new Paragraph({ children: [] })],
    })
  );

  const colWidths = [
    ...Array.from({ length: filled }, (_, i) => cellW + (i === filled - 1 ? extra : 0)),
    ...Array(empty).fill(cellW),
  ];

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [new TableRow({ children: [...filledCells, ...emptyCells] })],
  });
}

// ============================================================
// OVERALL SCORE BAR (out of 100, 20 cells each = 5 pts)
// ============================================================
function overallScoreBar(score, totalWidth = 9360) {
  const filled = Math.min(20, Math.max(0, Math.round(score / 5)));
  const empty   = 20 - filled;
  const cellW   = Math.floor(totalWidth / 20);
  const color   = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;

  const cells = [
    ...Array.from({ length: filled }, () => new TableCell({
      borders,
      width: { size: cellW, type: WidthType.DXA },
      shading: { fill: color, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 0, right: 0 },
      children: [new Paragraph({ children: [] })],
    })),
    ...Array.from({ length: empty }, () => new TableCell({
      borders,
      width: { size: cellW, type: WidthType.DXA },
      shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 0, right: 0 },
      children: [new Paragraph({ children: [] })],
    })),
  ];

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: Array(20).fill(cellW),
    rows: [new TableRow({ children: cells })],
  });
}

// ============================================================
// SECTION HEADER BAR (colored full-width with score + priority)
// ============================================================
function sectionHeaderBar(title, score, priority) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [6360, 1500, 1500],
    rows: [new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 6360, type: WidthType.DXA },
          shading: { fill: PRIMARY, type: ShadingType.CLEAR },
          margins: { top: 150, bottom: 150, left: 200, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 26, font: "Arial", color: WHITE })] })],
        }),
        new TableCell({
          borders,
          width: { size: 1500, type: WidthType.DXA },
          shading: { fill: scoreColor(score), type: ShadingType.CLEAR },
          margins: cellMargins,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${score}/10`, bold: true, size: 28, font: "Arial", color: WHITE })] })],
        }),
        new TableCell({
          borders,
          width: { size: 1500, type: WidthType.DXA },
          shading: { fill: priorityBg(priority), type: ShadingType.CLEAR },
          margins: cellMargins,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (priority || "medium").toUpperCase(), bold: true, size: 19, font: "Arial", color: priorityFg(priority) })] })],
        }),
      ],
    })],
  });
}

// ============================================================
// METRIC CARDS ROW
// ============================================================
function metricCards(metrics) {
  const count = Math.max(1, metrics.length);
  const cellW = Math.floor(9360 / count);
  const extra = 9360 - cellW * count;

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: metrics.map((_, i) => cellW + (i === count - 1 ? extra : 0)),
    rows: [new TableRow({
      children: metrics.map((m, i) => new TableCell({
        borders,
        width: { size: cellW + (i === count - 1 ? extra : 0), type: WidthType.DXA },
        shading: { fill: m.bg || BLUE_TINT, type: ShadingType.CLEAR },
        margins: tallCellMargins,
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: String(m.value), bold: true, size: 40, font: "Arial", color: m.color || PRIMARY })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.label, size: 18, font: "Arial", color: GRAY })] }),
        ],
      })),
    })],
  });
}

// ============================================================
// TWO-COLUMN FINDINGS / OPPORTUNITIES TABLE
// ============================================================
function findingsOppsTable(findings = [], opportunities = []) {
  const leftItems  = findings.map((f) => bulletItem(f, "findings"));
  const rightItems = opportunities.map((o) => bulletItem(o, "opportunities", PRIMARY));

  if (leftItems.length === 0)  leftItems.push(para("No specific findings noted.", { color: GRAY, size: 20 }));
  if (rightItems.length === 0) rightItems.push(para("No specific opportunities noted.", { color: GRAY, size: 20 }));

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4560, 4800],
    rows: [
      // Column headers
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 4560, type: WidthType.DXA },
            shading: { fill: "FEF2F2", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 160, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Key Findings", bold: true, size: 22, font: "Arial", color: RED })] })],
          }),
          new TableCell({
            borders,
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: BLUE_TINT, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 160, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Growth Opportunities", bold: true, size: 22, font: "Arial", color: PRIMARY })] })],
          }),
        ],
      }),
      // Content
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 4560, type: WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 100, right: 80 },
            children: leftItems,
          }),
          new TableCell({
            borders,
            width: { size: 4800, type: WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 100, right: 80 },
            children: rightItems,
          }),
        ],
      }),
    ],
  });
}

// ============================================================
// MAIN EXPORT
// ============================================================
export async function generateReport(auditData) {
  const audit             = auditData;
  const companyName       = audit.lead?.companyName || "Unknown Company";
  const websiteUrl        = audit.lead?.websiteUrl  || "";
  const auditDate         = audit.lead?.auditDate   || new Date().toISOString().split("T")[0];
  const overallScore      = audit.overallScore      || 0;
  const sections          = audit.sections          || [];
  const quickWins         = audit.quickWins         || [];
  const services          = audit.recommendedServices || [];
  const competitorInsights = audit.competitorInsights || "";
  const executiveSummary  = audit.executiveSummary  || "";
  const rawMetrics        = audit.rawMetrics        || {};
  const gmb               = rawMetrics.gmb          || {};
  const socialMetrics     = rawMetrics.social       || {};

  const overallColor = overallScore >= 70 ? GREEN : overallScore >= 50 ? AMBER : RED;
  const overallLabel = overallScore >= 70 ? "Strong Digital Presence"
                     : overallScore >= 50 ? "Needs Improvement"
                     : "Critical Gaps Found";

  // ============================================================
  // GMB CARDS
  // ============================================================
  const gmbCardDefs = [];
  if (gmb.rating     !== undefined) gmbCardDefs.push({ label: "Google Rating",    value: `${gmb.rating}/5`,    color: gmb.rating >= 4 ? GREEN : gmb.rating >= 3 ? AMBER : RED,       bg: gmb.rating >= 4 ? "F0FDF4" : "FEF9EC" });
  if (gmb.reviewCount !== undefined) gmbCardDefs.push({ label: "Total Reviews",   value: gmb.reviewCount,      color: PRIMARY,                                                          bg: BLUE_TINT });
  if (gmb.isClaimed  !== undefined) gmbCardDefs.push({ label: "Listing Status",   value: gmb.isClaimed ? "Claimed" : "Unclaimed", color: gmb.isClaimed ? GREEN : RED,              bg: gmb.isClaimed ? "F0FDF4" : "FEF2F2" });
  if (gmb.hasOwnerResponses !== undefined) gmbCardDefs.push({ label: "Owner Responses", value: gmb.hasOwnerResponses ? "Active" : "None", color: gmb.hasOwnerResponses ? GREEN : RED, bg: gmb.hasOwnerResponses ? "F0FDF4" : "FEF2F2" });
  if (gmb.photoCount !== undefined) gmbCardDefs.push({ label: "Photos Listed",    value: gmb.photoCount,       color: DARK,                                                             bg: LIGHT_BG });

  const gmbSection = gmbCardDefs.length > 0 ? [
    spacer(400),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Google My Business")] }),
    divider(),
    para("How this business appears on Google Search and Maps at time of audit:", { color: GRAY, size: 20, after: 120 }),
    metricCards(gmbCardDefs),
    ...(gmb.address  ? [spacer(80), para(`Address:   ${gmb.address}`,  { color: GRAY, size: 20 })] : []),
    ...(gmb.category ? [para(`Category:  ${gmb.category}`, { color: GRAY, size: 20 })] : []),
    ...(gmb.phone    ? [para(`Phone:     ${gmb.phone}`,    { color: GRAY, size: 20 })] : []),
  ] : [];

  // ============================================================
  // SOCIAL TABLE ROWS
  // ============================================================
  const platformDefs = [
    { key: "instagram", label: "Instagram" },
    { key: "facebook",  label: "Facebook"  },
    { key: "tiktok",    label: "TikTok"    },
    { key: "youtube",   label: "YouTube"   },
  ];

  const hdrCell = (txt, w) => new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text: txt, bold: true, size: 20, font: "Arial", color: WHITE })] })],
  });

  const socialRows = [
    new TableRow({ children: [
      hdrCell("Platform",                2000),
      hdrCell("Followers / Subscribers", 2600),
      hdrCell("Posts / Videos",          2200),
      hdrCell("Additional Info",         1560),
      hdrCell("Status",                  1000),
    ]}),
  ];

  platformDefs.forEach(({ key, label }, i) => {
    const d   = socialMetrics[key] || {};
    const bg  = i % 2 === 1 ? { fill: LIGHT_BG, type: ShadingType.CLEAR } : undefined;
    const followers = d.followers || d.subscribers || "—";
    const posts     = d.postCount || d.videoCount  || "—";
    const extra     = d.totalLikes ? `${d.totalLikes} likes` : d.likes ? `${d.likes} page likes` : d.isVerified ? "Verified" : "—";
    const status    = d.found ? "Active" : (d.error === "No " + label + " URL found" ? "Not Linked" : "Not Found");
    const statusClr = d.found ? GREEN : GRAY;

    const dc = (txt, w) => new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: bg,
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: String(txt), size: 20, font: "Arial" })] })],
    });

    socialRows.push(new TableRow({ children: [
      new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial" })] })] }),
      dc(followers, 2600),
      dc(posts,     2200),
      dc(extra,     1560),
      new TableCell({ borders, width: { size: 1000, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: status, bold: true, size: 18, font: "Arial", color: statusClr })] })] }),
    ]}));
  });

  // ============================================================
  // SECTION CONTENT
  // ============================================================
  const sectionContent = [];
  for (const section of sections) {
    sectionContent.push(
      spacer(320),
      sectionHeaderBar(section.title, section.score, section.priority),
      spacer(80),
      scoreBar(section.score, 9360),
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: `${scoreLabel(section.score)}   `, bold: true, size: 20, font: "Arial", color: scoreColor(section.score) }),
          new TextRun({ text: `Score: ${section.score}/10`, size: 20, font: "Arial", color: GRAY }),
        ],
      }),
      findingsOppsTable(section.findings || [], section.opportunities || []),
    );
  }

  // ============================================================
  // DOCUMENT
  // ============================================================
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: PRIMARY },
          paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: DARK },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "findings",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }],
        },
        {
          reference: "opportunities",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: ">", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }],
        },
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }],
        },
        {
          reference: "numbers",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }],
        },
      ],
    },

    sections: [

      // ===========================================================
      // COVER PAGE
      // ===========================================================
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children: [
          // Brand bar
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [new TableRow({ children: [new TableCell({
              borders: noBorders,
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: PRIMARY, type: ShadingType.CLEAR },
              margins: { top: 280, bottom: 280, left: 400, right: 400 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "KORETECHX DIGITAL", size: 28, bold: true, font: "Arial", color: WHITE, characterSpacing: 300 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Digital Agency  |  USA  |  UK  |  Canada", size: 18, font: "Arial", color: "CCE0FF" })] }),
              ],
            })] })],
          }),

          spacer(2000),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: "Digital Presence Audit Report", size: 56, bold: true, font: "Arial", color: DARK })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 8 } },
            children: [],
          }),

          spacer(280),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: companyName, size: 44, bold: true, font: "Arial", color: PRIMARY })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [new TextRun({ text: websiteUrl, size: 22, font: "Arial", color: GRAY })],
          }),

          spacer(600),

          // Score snapshot on cover
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2800, 6560],
            rows: [new TableRow({ children: [
              new TableCell({
                borders,
                width: { size: 2800, type: WidthType.DXA },
                shading: { fill: overallColor, type: ShadingType.CLEAR },
                margins: { top: 300, bottom: 300, left: 200, right: 200 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(overallScore), size: 80, bold: true, font: "Arial", color: WHITE })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "out of 100", size: 20, font: "Arial", color: WHITE })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "OVERALL SCORE", size: 16, bold: true, font: "Arial", color: WHITE })] }),
                ],
              }),
              new TableCell({
                borders,
                width: { size: 6560, type: WidthType.DXA },
                shading: { fill: BLUE_TINT, type: ShadingType.CLEAR },
                margins: { top: 200, bottom: 200, left: 280, right: 200 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: overallLabel, bold: true, size: 26, font: "Arial", color: overallColor })] }),
                  ...sections.map((s) => new Paragraph({
                    spacing: { after: 60 },
                    children: [
                      new TextRun({ text: `${s.score}/10   `, bold: true, size: 19, font: "Arial", color: scoreColor(s.score) }),
                      new TextRun({ text: s.title, size: 19, font: "Arial", color: GRAY }),
                    ],
                  })),
                ],
              }),
            ]})],
          }),

          spacer(1200),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Prepared by Koretechx Digital   |   ${auditDate}`, size: 20, font: "Arial", color: GRAY })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80 },
            children: [new TextRun({ text: "Confidential", size: 18, font: "Arial", color: GRAY, italics: true })],
          }),
        ],
      },

      // ===========================================================
      // MAIN REPORT
      // ===========================================================
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 4 } },
              alignment: AlignmentType.RIGHT,
              spacing: { after: 80 },
              children: [new TextRun({ text: `${companyName}   |   Digital Audit Report   |   Koretechx Digital`, size: 16, font: "Arial", color: "999999" })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 4 } },
              alignment: AlignmentType.CENTER,
              spacing: { before: 80 },
              children: [
                new TextRun({ text: "Koretechx Digital   |   Page ", size: 16, font: "Arial", color: "999999" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: "999999" }),
                new TextRun({ text: " of ", size: 16, font: "Arial", color: "999999" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Arial", color: "999999" }),
              ],
            })],
          }),
        },

        children: [

          // ===== EXECUTIVE SUMMARY =====
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Executive Summary")] }),
          divider(),
          para(executiveSummary, { after: 200 }),

          // Overall score visual
          spacer(80),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Overall Digital Health Score:   ", bold: true, size: 24, font: "Arial", color: DARK }),
              new TextRun({ text: `${overallScore}/100  —  ${overallLabel}`, bold: true, size: 24, font: "Arial", color: overallColor }),
            ],
          }),
          overallScoreBar(overallScore, 9360),
          spacer(200),

          // Section score grid
          para("Section Scores at a Glance", { bold: true, size: 22, after: 80 }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, shading: { fill: DARK, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Section", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
                new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, shading: { fill: DARK, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Score", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
              ]}),
              ...sections.map((s, i) => new TableRow({ children: [
                new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, shading: i % 2 === 1 ? { fill: LIGHT_BG, type: ShadingType.CLEAR } : undefined, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: s.title, size: 20, font: "Arial" })] })] }),
                new TableCell({
                  borders, width: { size: 4680, type: WidthType.DXA }, shading: i % 2 === 1 ? { fill: LIGHT_BG, type: ShadingType.CLEAR } : undefined, margins: cellMargins,
                  children: [new Paragraph({ children: [
                    new TextRun({ text: `${s.score}/10   `, bold: true, size: 20, font: "Arial", color: scoreColor(s.score) }),
                    new TextRun({ text: scoreLabel(s.score), size: 18, font: "Arial", color: GRAY }),
                  ]})],
                }),
              ]})),
            ],
          }),

          // ===== GMB SECTION =====
          ...gmbSection,

          // ===== SOCIAL MEDIA PROFILES =====
          spacer(400),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Social Media Profiles")] }),
          divider(),
          para("Public profile data collected at time of audit. These numbers are visible to anyone visiting the profiles.", { color: GRAY, size: 20, after: 120 }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2000, 2600, 2200, 1560, 1000],
            rows: socialRows,
          }),

          // ===== DETAILED ANALYSIS =====
          spacer(400),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Detailed Analysis")] }),
          divider(),
          para("Each section is scored from 1 to 10. Findings (left) are what was observed. Growth Opportunities (right) are what Koretechx can deliver.", { color: GRAY, size: 20 }),
          ...sectionContent,

          // ===== QUICK WINS =====
          spacer(400),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Quick Wins")] }),
          divider(),
          para("High-impact improvements that can be implemented immediately with minimal effort:"),
          spacer(80),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2600, 5360, 1400],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 2600, type: WidthType.DXA }, shading: { fill: PRIMARY, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Action", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
                new TableCell({ borders, width: { size: 5360, type: WidthType.DXA }, shading: { fill: PRIMARY, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
                new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, shading: { fill: PRIMARY, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Effort", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
              ]}),
              ...quickWins.map((qw, i) => {
                const bg = i % 2 === 1 ? { fill: LIGHT_BG, type: ShadingType.CLEAR } : undefined;
                const effortClr = qw.effort === "low" ? GREEN : AMBER;
                const effortBg  = qw.effort === "low" ? "F0FDF4" : "FEF3C7";
                return new TableRow({ children: [
                  new TableCell({ borders, width: { size: 2600, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: qw.title, bold: true, size: 20, font: "Arial" })] })] }),
                  new TableCell({ borders, width: { size: 5360, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: qw.description, size: 20, font: "Arial" })] })] }),
                  new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, shading: { fill: effortBg, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (qw.effort || "medium").toUpperCase(), bold: true, size: 18, font: "Arial", color: effortClr })] })] }),
                ]});
              }),
            ],
          }),

          // ===== RECOMMENDED SERVICES =====
          spacer(400),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Recommended Services")] }),
          divider(),
          para("These Koretechx Digital services directly address the gaps identified in this audit:"),
          spacer(80),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2400, 5560, 1400],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: ACCENT, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Service", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
                new TableCell({ borders, width: { size: 5560, type: WidthType.DXA }, shading: { fill: ACCENT, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: "Why It Matters", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
                new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, shading: { fill: ACCENT, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Impact", bold: true, size: 20, font: "Arial", color: WHITE })] })] }),
              ]}),
              ...services.map((svc, i) => {
                const bg       = i % 2 === 1 ? { fill: "FFF5F5", type: ShadingType.CLEAR } : undefined;
                const impClr   = svc.impact === "high" ? RED : AMBER;
                const impBg    = svc.impact === "high" ? "FEE2E2" : "FEF3C7";
                return new TableRow({ children: [
                  new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: svc.service, bold: true, size: 20, font: "Arial" })] })] }),
                  new TableCell({ borders, width: { size: 5560, type: WidthType.DXA }, shading: bg, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: svc.rationale, size: 20, font: "Arial" })] })] }),
                  new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, shading: { fill: impBg, type: ShadingType.CLEAR }, margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (svc.impact || "medium").toUpperCase(), bold: true, size: 18, font: "Arial", color: impClr })] })] }),
                ]});
              }),
            ],
          }),

          // ===== COMPETITOR INSIGHTS =====
          ...(competitorInsights ? [
            spacer(400),
            new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Competitive Landscape")] }),
            divider(ACCENT),
            new Table({
              width: { size: 9360, type: WidthType.DXA },
              columnWidths: [9360],
              rows: [new TableRow({ children: [new TableCell({
                borders,
                width: { size: 9360, type: WidthType.DXA },
                shading: { fill: "FFF5F5", type: ShadingType.CLEAR },
                margins: { top: 200, bottom: 200, left: 280, right: 280 },
                children: [new Paragraph({ children: [new TextRun({ text: competitorInsights, size: 22, font: "Arial", italic: true, color: DARK })] })],
              })] })],
            }),
          ] : []),

          // ===== NEXT STEPS / CTA =====
          spacer(400),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Next Steps")] }),
          divider(),
          para("Your audit has identified clear opportunities. Here is how to move forward:"),
          spacer(80),
          ...[
            "Review the high-priority sections first and focus on critical gaps immediately.",
            "Implement the quick wins listed above within the next 7 days.",
            "Contact our team to discuss a tailored strategy and pricing for your goals.",
          ].map((s) => bulletItem(s, "numbers")),

          spacer(400),

          // CTA Box
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [new TableRow({ children: [new TableCell({
              borders: noBorders,
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: PRIMARY, type: ShadingType.CLEAR },
              margins: { top: 360, bottom: 360, left: 480, right: 480 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Ready to Transform Your Digital Presence?", size: 32, bold: true, font: "Arial", color: WHITE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: "Let's talk about what Koretechx Digital can do for you.", size: 22, font: "Arial", color: "CCE0FF" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Jerry Long   |   jerry@koretechx.com", size: 26, bold: true, font: "Arial", color: WHITE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "www.koretechx.com", size: 20, font: "Arial", color: "CCE0FF" })] }),
              ],
            })] })],
          }),

          spacer(400),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "This report was generated by Koretechx Digital's AI audit system. Data reflects public information at the time of audit.", size: 16, font: "Arial", color: "999999", italics: true })],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}