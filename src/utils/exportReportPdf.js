import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import secureLensLogo from "../assets/Securelens-logo.png";

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
   * CONTROL DETAILS
   */

  const controlsY =
    doc.lastAutoTable.finalY + 9;

  doc.setFont(
    "helvetica",
    "bold"
  );

  doc.setFontSize(12);

  doc.text(
    "Control Assessment Details",
    margin,
    controlsY
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

    didDrawPage: () => {
      const pageHeight =
        doc.internal.pageSize.getHeight();

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setFontSize(7);

      doc.text(
        "SecureLens Security Assessment Report",
        margin,
        pageHeight - 7
      );

      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber}`,
        pageWidth - margin,
        pageHeight - 7,
        {
          align: "right",
        }
      );
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