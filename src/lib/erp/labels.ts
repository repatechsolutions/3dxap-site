import { ean13Svg } from "./ean13";

export type LabelSizeId = "100x150" | "40x25" | "50x30";

export type LabelSize = {
  id: LabelSizeId;
  label: string;
  w: number;
  h: number;
  cols: number;
  rows: number;
  caption: string;
};

export const LABEL_SIZES: LabelSize[] = [
  {
    id: "100x150",
    label: "100 × 150 mm",
    w: 100,
    h: 150,
    cols: 1,
    rows: 1,
    caption: "Uma etiqueta por folha, no papel 10×15 da Elgin L42 Pro.",
  },
  {
    id: "40x25",
    label: "40 × 25 mm",
    w: 40,
    h: 25,
    cols: 2,
    rows: 5,
    caption: "Grade de 10 etiquetas na folha 100×150 mm.",
  },
  {
    id: "50x30",
    label: "50 × 30 mm",
    w: 50,
    h: 30,
    cols: 2,
    rows: 4,
    caption: "Grade de 8 etiquetas na folha 100×150 mm.",
  },
];

export function labelSize(id: LabelSizeId): LabelSize {
  const found = LABEL_SIZES.find((size) => size.id === id);
  if (!found) return LABEL_SIZES[0];
  return found;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function labelDocument(input: {
  name: string;
  barcode: string;
  size: LabelSize;
  copies: number;
}): string {
  const copies = Math.min(200, Math.max(1, Math.floor(input.copies)));
  const perPage = input.size.cols * input.size.rows;
  const pageCount = Math.ceil(copies / perPage);
  const gapX = (100 - input.size.cols * input.size.w) / (input.size.cols + 1);
  const gapY = (150 - input.size.rows * input.size.h) / (input.size.rows + 1);
  const nameSize = input.size.id === "100x150" ? 18 : 8;
  const brandSize = input.size.id === "100x150" ? 14 : 7;
  const svg = ean13Svg(input.barcode, {
    module: input.size.id === "100x150" ? 2.2 : 1.35,
    barHeight: input.size.id === "100x150" ? 90 : 48,
  });
  const pages: string[] = [];
  let left = copies;
  for (let page = 0; page < pageCount; page += 1) {
    const cells: string[] = [];
    const count = Math.min(perPage, left);
    for (let i = 0; i < count; i += 1) {
      const col = i % input.size.cols;
      const row = Math.floor(i / input.size.cols);
      const x = gapX + col * (input.size.w + gapX);
      const y = gapY + row * (input.size.h + gapY);
      cells.push(
        `<article class="label" style="left:${x}mm;top:${y}mm;width:${input.size.w}mm;height:${input.size.h}mm">
          <div class="brand" style="font-size:${brandSize}pt">3DXAP</div>
          <div class="name" style="font-size:${nameSize}pt">${escapeHtml(input.name)}</div>
          <div class="bars">${svg}</div>
        </article>`,
      );
    }
    left -= count;
    pages.push(`<section class="sheet">${cells.join("")}</section>`);
  }
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Etiqueta ${escapeHtml(input.barcode)}</title>
<style>
  @page { size: 100mm 150mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet { position: relative; width: 100mm; height: 150mm; page-break-after: always; overflow: hidden; }
  .label { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 1.5mm; overflow: hidden; }
  .brand { font-family: "Geist Variable", sans-serif; font-weight: 600; letter-spacing: 0.08em; }
  .name { font-family: "Geist Variable", sans-serif; font-weight: 600; text-align: center; line-height: 1.15; }
  .bars { width: 100%; display: flex; justify-content: center; }
  .bars svg { width: 96%; height: auto; }
</style>
</head>
<body>${pages.join("")}</body>
</html>`;
}

export function printLabels(input: {
  name: string;
  barcode: string;
  size: LabelSize;
  copies: number;
}): void {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) throw new Error("popup");
  win.document.open();
  win.document.write(labelDocument(input));
  win.document.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 200);
}
