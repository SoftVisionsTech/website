/* ========= Helpers ========= */
const $ = (sel) => document.querySelector(sel);
const mmToPt = (mm) => (parseFloat(mm) * 72.0) / 25.4;

function makeValue(prefix, serial, suffix) {
  return `${prefix}${serial}${suffix}`;
}

function jsbOptions() {
  const displayValue = $("#printTextSwitch").checked;
  const textMarginMm = Number($("#textDistance").value) || 0.5;
  const textMargin = textMarginMm * 3.78;

  return {
    format: "CODE39",
    displayValue,
    textMargin,
    width: 2,
    height: 80,
    margin: 10,
    lineColor: "#000",
    background: "#fff"
  };
}

/* ========= Preview ========= */
function renderPreview() {
  const val = makeValue($("#prefix").value, $("#serial").value, $("#suffix").value);
  const svg = $("#previewSvg");
  svg.innerHTML = "";
  JsBarcode(svg, val, jsbOptions());
}

/* ========= Single (PNG/SVG) ========= */
function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

function downloadSingle() {
  // Add a “Format” input next to preview if you want; for now, PNG default if not present.
  let fmtSel = $("#fmt");
  // If you decided to keep Format only in Multiple, we can default to PNG:
  const fmt = fmtSel ? fmtSel.value : "png";

  const val = makeValue($("#prefix").value, $("#serial").value, $("#suffix").value);

  if (fmt === "svg") {
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    JsBarcode(tempSvg, val, jsbOptions());
    const xml  = new XMLSerializer().serializeToString(tempSvg);
    const blob = new Blob([xml], { type:"image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    triggerDownload(url, "barcode.svg");
  } else {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, val, jsbOptions());
    canvas.toBlob((blob)=>{
      const url = URL.createObjectURL(blob);
      triggerDownload(url, "barcode.png");
    }, "image/png");
  }
}

/* ========= Multiple (PDF) ========= */
async function downloadBatchPDF() {
  const prefix = $("#prefix").value;
  const suffix = $("#suffix").value;
  const start  = Number($("#startSerialBatch").value) || 1;
  const count  = Number($("#count").value) || 1;
  const pad    = Number($("#pad").value) || 0;

  const rows   = Number($("#rows").value) || 7;
  const cols   = Number($("#cols").value) || 3;

  const mm2pt = (v, def) => (parseFloat(v ?? def) * 72.0) / 25.4;
  const labelW = mm2pt($("#lw").value, 63.5);
  const labelH = mm2pt($("#lh").value, 38.1);
  const gapH   = mm2pt($("#gh").value, 2.5);
  const gapV   = mm2pt($("#gv").value, 2.5);
  const margin = mm2pt($("#mg").value, 10);

  const pageSize = ($("#page").value === "LETTER")
    ? [612, 792]
    : [595.28, 841.89];

  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage(pageSize);
  let pageH = page.getHeight();

  const maxPerPage = rows * cols;

  async function barcodePngBytes(value) {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, jsbOptions());
    const dataUrl = canvas.toDataURL("image/png");
    const b64 = dataUrl.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  for (let i=0;i<count;i++) {
    if (i>0 && i % maxPerPage === 0) {
      page = pdfDoc.addPage(pageSize);
      pageH = page.getHeight();
    }
    const idx = i % maxPerPage;
    const r = Math.floor(idx / cols);
    const c = idx % cols;

    const serial = String(start + i).padStart(pad, "0");
    const value  = makeValue(prefix, serial, suffix);

    const cellX = margin + c*(labelW + gapH);
    const cellTop = pageH - margin - r*(labelH + gapV);

    const pngBytes = await barcodePngBytes(value);
    const png = await pdfDoc.embedPng(pngBytes);

    const maxW = labelW * 0.9, maxH = labelH * 0.9;
    let w = png.width, h = png.height, aspect = (w ? h / w : 0.35);
    w = maxW; h = w * aspect;
    if (h > maxH) { h = maxH; w = h / aspect; }

    const drawX = cellX + (labelW - w)/2;
    const drawY = (cellTop - labelH) + (labelH - h)/2;

    page.drawImage(png, { x: drawX, y: drawY, width: w, height: h });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type:"application/pdf" });
  const url  = URL.createObjectURL(blob);
  triggerDownload(url, "labels.pdf");
}

/* ========= Mode toggle ========= */
const modeSwitch   = $("#modeSwitch");
const modeLabel    = $("#modeLabel");

const generateCard = $("#generateCard");  // right column
const btnGoSingle  = $("#btnGoSingle");   // below preview (single only)
const btnHintSingle= $("#btnHintSingle");
const btnGoMulti   = $("#btnGoMulti");    // in right card (multiple only)
const btnHintMulti = $("#btnHintMulti");

function setMode(multiple) {
  if (multiple) {
    modeLabel.textContent = "Multiple";
    // Show right column, show Multi download
    generateCard.classList.remove("d-none");
    btnGoMulti.classList.remove("d-none");
    btnHintMulti.classList.remove("d-none");

    // Hide single download under preview
    btnGoSingle.classList.add("d-none");
    btnHintSingle.classList.add("d-none");
  } else {
    modeLabel.textContent = "Single";
    // Hide right column entirely; show single download under preview
    generateCard.classList.add("d-none");
    btnGoSingle.classList.remove("d-none");
    btnHintSingle.classList.remove("d-none");

    // Make sure multi button is hidden when the card is hidden
    btnGoMulti.classList.add("d-none");
    btnHintMulti.classList.add("d-none");
  }
}

// default single mode
modeSwitch.checked = false;
setMode(false);
modeSwitch.addEventListener("change", () => setMode(modeSwitch.checked));

/* ========= Bind the two download buttons ========= */
btnGoSingle.addEventListener("click", downloadSingle);
btnGoMulti.addEventListener("click", downloadBatchPDF);

/* ========= Preview ========= */
$("#btnPreview").addEventListener("click", renderPreview);
renderPreview();
