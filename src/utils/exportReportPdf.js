import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import secureLensLogo from "../assets/Securelens-logo.png";
import { buildRiskSummary } from "./riskSummary";

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");

      context.drawImage(image, 0, 0);

      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      resolve(null);
    };

    image.src = url;
  });
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-z0-9-_]/gi, "-")
    .replace(/-+/g, "-");
}

export async function exportSystemReport(system) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  const margin = 14;

  // Draws a bold heading, starting a new page when too close to the
  // bottom. Returns the y position the heading was drawn at.
  function sectionHeading(title, y, size = 12) {
    let headingY = y;

    if (headingY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      headingY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    doc.text(title, margin, headingY);

    return headingY;
  }

  /*
   * COUNTS
   */

  const metCount = system.controls.filter(
    (control) => control.status === "Met"
  ).length;

  const partiallyMetCount = system.controls.filter(
    (control) => control.status === "Partially Met"
  ).length;

  const notMetCount = system.controls.filter(
    (control) => control.status === "Not Met"
  ).length;

  const notAssessedCount = system.controls.filter(
    (control) => control.status === "Not Assessed"
  ).length;

  /*
   * LOGO
   */

  const logo = await loadImage(secureLensLogo);

  let titleX = margin;

  if (logo) {
    const maxWidth = 30;
    const maxHeight = 18;

    const scale = Math.min(
      maxWidth / logo.width,
      maxHeight / logo.height
    );

    const width = logo.width * scale;
    const height = logo.height * scale;

    doc.addImage(
      logo.dataUrl,
      "PNG",
      margin,
      9,
      width,
      height
    );

    titleX = margin + width + 6;
  }

  /*
   * HEADER
   */

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);

  doc.text(
    "SecureLens",
    titleX,
    16
  );

  doc.setFontSize(13);

  doc.text(
    "Security Assessment Report",
    titleX,
    23
  );

  doc.setFont(
    "helvetica",
    "normal"
  );

  doc.setFontSize(8);

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    pageWidth - margin,
    15,
    {
      align: "right",
    }
  );

  doc.text(
    "AI-Assisted Security Assessment Platform",
    pageWidth - margin,
    21,
    {
      align: "right",
    }
  );

  doc.setDrawColor(210);

  doc.line(
    margin,
    31,
    pageWidth - margin,
    31
  );

  /*
   * SYSTEM INFORMATION
   */

  doc.setFont(
    "helvetica",
    "bold"
  );

  doc.setFontSize(15);

  doc.text(
    system.name,
    margin,
    41
  );

  doc.setFont(
    "helvetica",
    "normal"
  );

  doc.setFontSize(9);

  if (system.description) {
    const description =
      doc.splitTextToSize(
        system.description,
        150
      );

    doc.text(
      description,
      margin,
      47
    );
  }

  /*
   * SYSTEM SUMMARY TABLE
   */

  autoTable(doc, {
    startY: 57,

    head: [
      [
        "Business Owner",
        "Environment",
        "Assessment Status",
        "Risk Level",
        "Progress",
        "Evidence",
      ],
    ],

    body: [
      [
        system.owner || "-",
        system.environment || "-",
        system.status || "-",
        system.risk || "-",
        `${system.progress || 0}%`,
        `${system.evidenceCount || 0} files`,
      ],
    ],

    theme: "grid",

    styles: {
      fontSize: 8,
      cellPadding: 3,
    },

    headStyles: {
      fontStyle: "bold",
    },
  });

  /*
   * ASSESSMENT SUMMARY
   */

  const summaryY =
    doc.lastAutoTable.finalY + 8;

  doc.setFont(
    "helvetica",
    "bold"
  );

  doc.setFontSize(12);

  doc.text(
    "Assessment Summary",
    margin,
    summaryY
  );

  autoTable(doc, {
    startY: summaryY + 4,

    head: [
      [
        "Total Controls",
        "Met",
        "Partially Met",
        "Not Met",
        "Not Assessed",
      ],
    ],

    body: [
      [
        system.controls.length,
        metCount,
        partiallyMetCount,
        notMetCount,
        notAssessedCount,
      ],
    ],

    theme: "grid",

    styles: {
      fontSize: 8,
      cellPadding: 3,
      halign: "center",
    },

    headStyles: {
      fontStyle: "bold",
    },
  });

  /*
   * RISK SUMMARY
   */

  const summary = buildRiskSummary(system);

  const textTable = (startY, rows, options = {}) =>
    autoTable(doc, {
      startY,
      body: rows.map((row) => [row]),
      theme: "plain",
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
        overflow: "linebreak",
      },
      margin: { left: margin, right: margin, bottom: 15 },
      ...options,
    });

  const riskY = sectionHeading(
    `Risk Summary (${summary.rating})`,
    doc.lastAutoTable.finalY + 9
  );

  textTable(riskY + 3, [summary.headline], {
    styles: {
      fontSize: 10,
      fontStyle: "bold",
      cellPadding: { top: 1, bottom: 2, left: 0, right: 0 },
      overflow: "linebreak",
    },
  });

  if (summary.points.length) {
    textTable(
      doc.lastAutoTable.finalY + 1,
      summary.points.map((point) => `•  ${point}`)
    );
  }

  if (summary.priorities.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Priority Gap", "Status", "Finding", "Evidence Files"]],
      body: summary.priorities.map((gap) => [
        `${gap.code}\n${gap.name}`,
        gap.status,
        gap.finding,
        String(gap.evidenceCount),
      ]),
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        valign: "top",
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 28 },
        3: { cellWidth: 25, halign: "center" },
      },
      headStyles: { fontStyle: "bold" },
      margin: { left: margin, right: margin, bottom: 15 },
    });
  }

  const stepsY = sectionHeading(
    "Recommended Next Steps",
    doc.lastAutoTable.finalY + 7,
    10
  );

  textTable(
    stepsY + 2,
    summary.nextSteps.map((step, index) => `${index + 1}.  ${step}`)
  );

  textTable(doc.lastAutoTable.finalY + 1, [summary.caveats.join(" ")], {
    styles: {
      fontSize: 7,
      textColor: [100, 100, 100],
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      overflow: "linebreak",
    },
  });

  /*
   * CONTROL DETAILS
   */

  const controlsY = sectionHeading(
    "Control Assessment Details",
    doc.lastAutoTable.finalY + 9
  );

  const controlRows =
    system.controls.map(
      (control) => {
        const evidenceNames =
          (control.evidence || [])
            .map(
              (evidence) =>
                evidence.name
            )
            .join("\n");

        return [
          `${control.code}\n${control.name}`,
          control.status,
          control.analystNotes?.trim()
            ? control.analystNotes
            : "No analyst notes recorded.",
          control.findings?.trim()
            ? control.findings
            : "No findings recorded.",
          evidenceNames ||
            "No evidence linked.",
        ];
      }
    );

  autoTable(doc, {
    startY: controlsY + 4,

    head: [
      [
        "Control",
        "Status",
        "Analyst Notes",
        "Findings",
        "Evidence",
      ],
    ],

    body:
      controlRows.length > 0
        ? controlRows
        : [
            [
              "-",
              "-",
              "No controls assigned.",
              "-",
              "-",
            ],
          ],

    theme: "grid",

    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      valign: "top",
      overflow: "linebreak",
    },

    columnStyles: {
      0: {
        cellWidth: 39,
      },

      1: {
        cellWidth: 27,
      },

      2: {
        cellWidth: 66,
      },

      3: {
        cellWidth: 66,
      },

      4: {
        cellWidth: 66,
      },
    },

    headStyles: {
      fontStyle: "bold",
    },

    margin: {
      left: margin,
      right: margin,
      bottom: 15,
    },
  });

  /*
   * DISCLAIMER
   */

  const finalY =
    doc.lastAutoTable.finalY + 8;

  const pageHeight =
    doc.internal.pageSize.getHeight();

  if (finalY < pageHeight - 25) {
    doc.setFontSize(7);

    doc.setTextColor(
      100,
      100,
      100
    );

    const disclaimer =
      "SecureLens is an educational security assessment platform. Assessment results should be reviewed by a qualified security professional before being used for compliance, certification, or authorization decisions.";

    doc.text(
      doc.splitTextToSize(
        disclaimer,
        pageWidth -
          margin * 2
      ),
      margin,
      finalY
    );
  }

  /*
   * PAGE FOOTERS (every page, including ones added by long sections)
   */

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);

    doc.text(
      "SecureLens Security Assessment Report",
      margin,
      pageHeight - 7
    );

    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: "right" }
    );
  }

  /*
   * SAVE
   */

  const filename =
    sanitizeFilename(
      system.name
    );

  doc.save(
    `${filename}-Security-Assessment-Report.pdf`
  );
}