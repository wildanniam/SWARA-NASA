// Kartu berbagi: gambar 1080 x 1920 yang dilukis dari bundle yang sedang tampil.
//
// Gayanya tarot dan peta bintang, tetapi tiap tempat yang biasanya hiasan diisi data:
// sinar di kartu I adalah tanggal pengamatan, sinar di kartu II adalah spektrum.
// Yang murni hiasan hanya bingkai, pita, dan bintang empat sudut (lihat web/DESIGN.md).

import qrcode from "qrcode-generator";
import { finding, type Manifest } from "./bundle";
import { microns, monthYear, shiftWords, span } from "./format";
import { LUTS, type PaletteId } from "./palette";
import { LAMBDA_MAX, LAMBDA_MIN, type SpectrumPoint } from "./spectrum";

export const CARD_W = 1080;
export const CARD_H = 1920;
const CX = CARD_W / 2;

export type CardKind = "wanderer" | "voice";
export const CARD_TITLE: Record<CardKind, string> = { wanderer: "Its motion", voice: "Its light" };

export type CardInput = {
  name: string;
  manifest: Manifest;
  look: PaletteId;
  /** Tautan yang dibuka kode QR, dan alamat situs yang ditulis di kartu. */
  url: string;
  site: string;
  /** Citra medan lebar, untuk langit redup di belakang kartu. */
  context?: HTMLImageElement;
  /** Citra WISE yang sudah termuat, urut waktu. */
  wiseImages: HTMLImageElement[];
  /** Penyetaraan nada untuk bundle lama yang citra WISE-nya belum ditulis ulang. */
  wiseTone?: Uint8ClampedArray;
  /** Satu frame SPHEREx: isi lensa kartu II, dan jendela kartu I kalau tidak ada WISE. */
  frame?: { image: HTMLImageElement; bandId: string; mjd: number };
  points?: SpectrumPoint[];
  /** Benda ini tidak terpisah dari bintang latar di data SPHEREx: kalimat penggantinya.
   *  Kartu lalu tidak menyebut pergeseran terukur dan tidak membuat kartu cahaya. */
  blended?: string;
  /** Gerak diri menurut katalog, detik busur per tahun; hanya ada untuk nama yang dicari. */
  cataloguePm?: number | null;
  today: Date;
};

export type RGB = [number, number, number];
export type Skin = {
  top: RGB;
  bottom: RGB;
  glow?: RGB;
  gold: RGB;
  hi: RGB;
  lo: RGB;
  text: RGB;
  muted: RGB;
  faint: RGB;
  banner: RGB;
  label: RGB;
  ink: RGB;
  dot: RGB;
};

const ACCENT: RGB = [255, 180, 84];

// Satu dek, enam warna: kartu mengikuti look yang sedang dipakai di viewer.
export const SKINS: Record<PaletteId, Skin> = {
  heat: {
    top: [30, 15, 10], bottom: [6, 5, 6], glow: [150, 62, 20], gold: [255, 180, 84], hi: [255, 224, 164], lo: [142, 92, 44],
    text: [242, 239, 232], muted: [194, 180, 164], faint: [156, 142, 128], banner: [20, 11, 8], label: [250, 242, 226], ink: [24, 13, 8], dot: ACCENT,
  },
  glacier: {
    top: [10, 24, 58], bottom: [4, 6, 16], glow: [40, 96, 176], gold: [184, 216, 244], hi: [236, 246, 255], lo: [84, 116, 158],
    text: [240, 244, 250], muted: [166, 184, 210], faint: [128, 146, 176], banner: [8, 16, 40], label: [240, 246, 252], ink: [8, 16, 40], dot: ACCENT,
  },
  aurora: {
    top: [8, 34, 40], bottom: [4, 8, 12], glow: [20, 110, 96], gold: [178, 226, 144], hi: [236, 250, 208], lo: [72, 122, 94],
    text: [238, 244, 236], muted: [164, 192, 180], faint: [122, 150, 140], banner: [6, 24, 28], label: [242, 248, 232], ink: [6, 24, 28], dot: ACCENT,
  },
  nebula: {
    top: [34, 20, 72], bottom: [8, 6, 20], glow: [122, 60, 168], gold: [240, 190, 106], hi: [255, 230, 178], lo: [140, 100, 62],
    text: [244, 240, 232], muted: [186, 176, 208], faint: [150, 140, 178], banner: [22, 13, 48], label: [248, 240, 222], ink: [24, 14, 46], dot: ACCENT,
  },
  gray: {
    top: [27, 28, 34], bottom: [6, 6, 9], glow: [92, 94, 108], gold: [214, 216, 224], hi: [246, 246, 250], lo: [106, 108, 120],
    text: [242, 242, 244], muted: [172, 174, 184], faint: [130, 132, 144], banner: [14, 15, 19], label: [244, 244, 246], ink: [14, 15, 19], dot: ACCENT,
  },
  paper: {
    top: [247, 243, 233], bottom: [233, 226, 208], gold: [58, 44, 32], hi: [22, 15, 10], lo: [160, 146, 124],
    text: [22, 16, 12], muted: [96, 86, 76], faint: [134, 124, 110], banner: [240, 233, 216], label: [255, 253, 246], ink: [22, 15, 10], dot: [196, 96, 30],
  },
};

const rgb = (c: RGB, a = 1) => (a === 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`);
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as RGB;

const SANS = '"Archivo Variable", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
/** Archivo pada lebar 125%, seperti nama benda di viewer. */
const wide = (size: number, weight = 600) => `${weight} expanded ${size}px ${SANS}`;
const mono = (size: number, weight = 400) => `${weight} ${size}px ${MONO}`;

const year = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ROMAN = ["", "I", "II", "III"];

type Ctx = CanvasRenderingContext2D;
type TextOptions = { align?: "left" | "center" | "right"; tracking?: number };

/** Teks pada garis dasar `y`, dengan jarak antar huruf. Mengembalikan lebarnya. */
function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, o: TextOptions = {}): number {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const tracking = o.tracking ?? 0;
  const widths = tracking ? [...s].map((ch) => ctx.measureText(ch).width) : [ctx.measureText(s).width];
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(widths.length - 1, 0);
  let at = x - (o.align === "right" ? total : o.align === "center" ? total / 2 : 0);
  if (!tracking) ctx.fillText(s, at, y);
  else
    [...s].forEach((ch, i) => {
      ctx.fillText(ch, at, y);
      at += widths[i] + tracking;
    });
  return total;
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function disc(ctx: Ctx, x: number, y: number, r: number, fill?: string, stroke?: string, width = 1.4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function arc(ctx: Ctx, x: number, y: number, r: number, fromDeg: number, toDeg: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, (fromDeg * Math.PI) / 180, (toDeg * Math.PI) / 180);
  ctx.stroke();
}

/** Titik pada lingkaran; sudut dalam derajat, 0 di kanan, searah jarum jam. */
const polar = (cx: number, cy: number, deg: number, r: number): [number, number] => [
  cx + Math.cos((deg * Math.PI) / 180) * r,
  cy + Math.sin((deg * Math.PI) / 180) * r,
];

/** Bintang empat sudut: hiasan bingkai, tidak pernah digambar di dalam jendela data. */
function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string, k = 0.2) {
  const q = r * k;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + q, y - q);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + q, y + q);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - q, y + q);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - q, y - q);
  ctx.closePath();
  ctx.fill();
}

/** Bagian citra abu-abu `src` diperbesar ke kanvas baru dan diwarnai lewat peta warna.
 *  `view` dalam piksel sumber dan boleh melewati tepinya; yang di luar jadi nilai 0. */
export function colorize(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  view: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
  lut: Uint8ClampedArray,
  tone?: Uint8ClampedArray,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const kx = outW / view.w;
  const ky = outH / view.h;
  ctx.drawImage(src, -view.x * kx, -view.y * ky, srcW * kx, srcH * ky);
  const data = ctx.getImageData(0, 0, outW, outH);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (tone ? tone[d[i]] : d[i]) * 3;
    d[i] = lut[v];
    d[i + 1] = lut[v + 1];
    d[i + 2] = lut[v + 2];
    d[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Semua epoch WISE jadi satu gambar: tiap piksel mengambil nilai paling terang di
 *  semua epoch. Bintang yang diam tetap titik; yang bergerak meninggalkan garis. */
export function stackBrightest(images: HTMLImageElement[]): HTMLCanvasElement {
  const w = images[0].naturalWidth;
  const h = images[0].naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const best = new Uint8ClampedArray(w * h);
  for (const img of images) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < best.length; i++) if (d[i * 4] > best[i]) best[i] = d[i * 4];
  }
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < best.length; i++) {
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = best[i];
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function background(ctx: Ctx, sk: Skin, look: PaletteId, context: HTMLImageElement | undefined, glow: [number, number, number]) {
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, rgb(sk.top));
  grad.addColorStop(1, rgb(sk.bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (context) {
    // Langit di belakang kartu adalah citra medan lebar yang asli, redup. Citra itu
    // persegi dan kartu tinggi, jadi ada tiga potongan yang mungkin; dipakai yang
    // paling sedikit piksel terangnya, supaya satu bintang terang tidak mendominasi.
    const n = context.naturalWidth;
    const probe = document.createElement("canvas");
    probe.width = probe.height = 96;
    const pc = probe.getContext("2d", { willReadFrequently: true })!;
    pc.drawImage(context, 0, 0, 96, 96);
    const px = pc.getImageData(0, 0, 96, 96).data;
    const share = CARD_W / CARD_H;
    const bright = (start: number) => {
      let count = 0;
      const x0 = Math.floor(start * 96);
      const x1 = Math.floor((start + share) * 96);
      for (let y = 0; y < 96; y++) for (let x = x0; x < x1; x++) if (px[(y * 96 + x) * 4] > 200) count++;
      return count;
    };
    const start = [0, (1 - share) / 2, 1 - share].reduce((a, b) => (bright(b) < bright(a) ? b : a));
    const sky = colorize(context, n, n, { x: start * n, y: 0, w: share * n, h: n }, CARD_W, CARD_H, LUTS[look]);
    ctx.save();
    ctx.globalAlpha = look === "paper" ? 0.16 : 0.22;
    ctx.globalCompositeOperation = look === "paper" ? "source-over" : "lighten";
    ctx.drawImage(sky, 0, 0);
    ctx.restore();
  }

  if (sk.glow) {
    const [x, y, r] = glow;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      g.addColorStop(t, rgb(sk.glow, 0.42 * Math.exp(-2 * (t * 1.6) ** 2)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }
}

/** Bingkai kartu: sudut cekung, garis ganda, dan satu baris titik. */
function border(ctx: Ctx, sk: Skin) {
  const i1 = 38;
  const r1 = 30;
  const i2 = 52;
  const r2 = 46;
  const i3 = 68;
  const reach = Math.sqrt(r2 * r2 - (i2 - i1) ** 2);
  const cut = (Math.asin((i2 - i1) / r2) * 180) / Math.PI;
  const rings: [number, number, RGB, number, number, number][] = [
    [i1, r1, sk.gold, 2.4, i1 + r1, 0],
    [i2, r2, sk.lo, 1.2, i1 + reach, cut],
  ];
  for (const [inset, rad, color, width, from, trim] of rings) {
    const c = rgb(color);
    line(ctx, from, inset, CARD_W - from, inset, c, width);
    line(ctx, from, CARD_H - inset, CARD_W - from, CARD_H - inset, c, width);
    line(ctx, inset, from, inset, CARD_H - from, c, width);
    line(ctx, CARD_W - inset, from, CARD_W - inset, CARD_H - from, c, width);
    const corners: [number, number, number][] = [
      [i1, i1, 0],
      [CARD_W - i1, i1, 90],
      [CARD_W - i1, CARD_H - i1, 180],
      [i1, CARD_H - i1, 270],
    ];
    for (const [x, y, a] of corners) arc(ctx, x, y, rad, a + trim, a + 90 - trim, c, width);
  }
  const dots = rgb(sk.lo);
  for (let x = i3 + 40; x < CARD_W - i3 - 39; x += 16) {
    disc(ctx, x, i3, 1.5, dots);
    disc(ctx, x, CARD_H - i3, 1.5, dots);
  }
  for (let y = i3 + 40; y < CARD_H - i3 - 39; y += 16) {
    if (Math.abs(y - CARD_H / 2) < 26) continue;
    disc(ctx, i3, y, 1.5, dots);
    disc(ctx, CARD_W - i3, y, 1.5, dots);
  }
  sparkle(ctx, i3, CARD_H / 2, 13, rgb(sk.gold));
  sparkle(ctx, CARD_W - i3, CARD_H / 2, 13, rgb(sk.gold));
}

function head(ctx: Ctx, sk: Skin, numeral: string, hook: string) {
  const w = text(ctx, numeral, CX, 124, wide(44, 600), rgb(sk.hi), { align: "center", tracking: 10 });
  for (const sign of [-1, 1]) {
    const x0 = CX + sign * (w / 2 + 30);
    const x1 = CX + sign * (w / 2 + 120);
    line(ctx, x0, 110, x1, 110, rgb(sk.lo), 1.2);
    sparkle(ctx, x1 + sign * 16, 110, 9, rgb(sk.gold));
  }
  text(ctx, hook, CX, 180, mono(16, 500), rgb(sk.gold), { align: "center", tracking: 5 });
}

function ribbon(ctx: Ctx, sk: Skin, y0: number, title: string) {
  const h = 88;
  const x0 = 120;
  const x1 = CARD_W - 120;
  const notch = 30;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1 - notch, y0 + h / 2);
  ctx.lineTo(x1, y0 + h);
  ctx.lineTo(x0, y0 + h);
  ctx.lineTo(x0 + notch, y0 + h / 2);
  ctx.closePath();
  ctx.fillStyle = rgb(sk.banner);
  ctx.fill();
  ctx.strokeStyle = rgb(sk.hi);
  ctx.lineWidth = 2;
  ctx.lineJoin = "miter";
  ctx.stroke();
  for (const y of [y0 + 10, y0 + h - 10]) line(ctx, x0 + 44, y, x1 - 44, y, rgb(sk.lo), 1);
  text(ctx, title, CX, y0 + 60, wide(46, 700), rgb(sk.hi), { align: "center", tracking: 8 });
}

function qr(ctx: Ctx, url: string, x: number, y: number, box: number, dark: string, light: string) {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const quiet = 2;
  // Modul berukuran bilangan bulat piksel, supaya tepinya tajam dan terbaca pemindai.
  const cell = Math.max(2, Math.floor(box / (n + quiet * 2)));
  const size = cell * (n + quiet * 2);
  const ox = Math.round(x + (box - size) / 2);
  const oy = Math.round(y + (box - size) / 2);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, box, box);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (code.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
}

type Line = [string, "text" | "muted" | "faint"];

/** Bagian bawah yang sama di semua kartu: pita julukan, nama, fakta, dan label ajakan. */
function lower(ctx: Ctx, sk: Skin, input: CardInput, title: string, lines: Line[], ask: string, index: string) {
  ribbon(ctx, sk, 1160, title);

  // Nama yang panjang (koordinat, nama katalog) dikecilkan sampai muat.
  const name = input.name.toUpperCase();
  let size = 38;
  ctx.font = wide(size, 600);
  const natural = [...name].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + 6 * (name.length - 1);
  if (natural > 720) size = Math.max(20, (size * 720) / natural);
  const w = text(ctx, name, CX, 1318, wide(size, 600), rgb(sk.text), { align: "center", tracking: (6 * size) / 38 });
  for (const sign of [-1, 1]) sparkle(ctx, CX + sign * (w / 2 + 36), 1305, 10, rgb(sk.gold));

  lines.forEach(([s, key], i) => text(ctx, s, CX, 1365 + i * 32, mono(16.5), rgb(sk[key]), { align: "center" }));

  // Label ajakan: ubin terang, supaya kode QR gelap di atas terang.
  const y0 = 1456;
  const h = 200;
  const x0 = 110;
  const x1 = CARD_W - 110;
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, h, 18);
  ctx.fillStyle = rgb(sk.label);
  ctx.fill();
  ctx.strokeStyle = rgb(sk.gold);
  ctx.lineWidth = 2;
  ctx.stroke();
  const edge = mix(sk.label, sk.ink, 0.28);
  ctx.beginPath();
  ctx.roundRect(x0 + 9, y0 + 9, x1 - x0 - 18, h - 18, 11);
  ctx.strokeStyle = rgb(edge);
  ctx.lineWidth = 1;
  ctx.stroke();
  qr(ctx, input.url, x0 + 24, y0 + 22, 156, rgb(sk.ink), rgb(sk.label));
  const tx = x0 + 204;
  text(ctx, "DRAW YOUR OWN CARD", tx, y0 + 63, wide(30, 700), rgb(sk.ink), { tracking: 2 });
  text(ctx, ask, tx, y0 + 108, mono(15.5), rgb(mix(sk.label, sk.ink, 0.7)));
  text(ctx, input.site, tx, y0 + 156, mono(17, 500), rgb(sk.ink));
  sparkle(ctx, x1 - 44, y0 + 46, 11, rgb(edge));

  // Tanda SWARA: cincin lensa dan satu titik.
  const bx = CX - 62;
  const by = 1700;
  disc(ctx, bx + 10, by + 15, 10, undefined, rgb(sk.text), 1.6);
  disc(ctx, bx + 19, by + 4, 4, rgb(sk.dot));
  text(ctx, "SWARA", bx + 34, by + 19, wide(16, 650), rgb(sk.text), { tracking: 2.4 });
  text(ctx, "Data: NASA SPHEREx and WISE, via IRSA and WiseView", CX, 1765, mono(12.5), rgb(sk.faint), { align: "center" });
  const d = input.today;
  const drawn = `DRAWN ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  text(ctx, `${index}  ·  ${drawn}`, CX, 1793, mono(12.5, 500), rgb(sk.faint), { align: "center", tracking: 2 });
}

function archPath(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
}

/** Kalimat tentang apa yang diukur SPHEREx, sama isinya dengan panel temuan di viewer. */
export function measured(input: Pick<CardInput, "manifest" | "blended" | "cataloguePm">): { title: string; line: string } {
  if (input.blended) return { title: "THE RIDDLE", line: input.blended };
  const f = finding(input.manifest);
  const pm = input.cataloguePm;
  const catalogue = pm != null && pm >= 0.1 ? `; the catalogue says ${pm.toFixed(1)}″ a year` : "";
  if (f.kind === "moved")
    return {
      title: "THE WANDERER",
      line: `SPHEREx measured ${shiftWords(f.east, f.north)} in ${span(f.fromMjd, f.toMjd)}${catalogue}`,
    };
  if (f.kind === "still")
    return {
      title: "THE STILL ONE",
      line: `SPHEREx measured no shift across ${f.visits} visits (within ${f.tolerance.toFixed(1)}″)${catalogue}`,
    };
  return { title: "THE RIDDLE", line: `SPHEREx could not track a position here${catalogue}` };
}

// ---------- I. Geraknya ----------
function wanderer(ctx: Ctx, sk: Skin, input: CardInput, index: string) {
  const m = input.manifest;
  const ax = 210;
  const ay = 370;
  const aw = 660;
  const ah = 830;
  const r = aw / 2;
  const cy = ay + r;
  background(ctx, sk, input.look, input.context, [CX, cy + 60, 560]);

  // Jendela: tumpukan semua epoch WISE, atau frame SPHEREx kalau riwayat WISE tidak ada.
  const wise = m.wise?.frames.length && input.wiseImages.length ? m.wise : undefined;
  const lut = LUTS[input.look];
  let hero: HTMLCanvasElement | undefined;
  if (wise) {
    const stack = stackBrightest(input.wiseImages);
    const field = Math.min(stack.width, stack.height) * wise.pixel_arcsec;
    const halfH = Math.min(140, field / 2) / wise.pixel_arcsec;
    const halfW = (halfH * aw) / ah;
    const view = { x: wise.target_px[0] + 0.5 - halfW, y: wise.target_px[1] + 0.5 - halfH, w: halfW * 2, h: halfH * 2 };
    hero = colorize(stack, stack.width, stack.height, view, aw, ah, lut, input.wiseTone);
  } else if (input.frame) {
    const img = input.frame.image;
    const halfH = (Math.min(140, m.fov_arcsec / 2) / m.fov_arcsec) * img.naturalHeight;
    const halfW = (halfH * aw) / ah;
    const view = { x: img.naturalWidth / 2 - halfW, y: img.naturalHeight / 2 - halfH, w: halfW * 2, h: halfH * 2 };
    hero = colorize(img, img.naturalWidth, img.naturalHeight, view, aw, ah, lut);
  }
  if (hero) {
    ctx.save();
    archPath(ctx, ax, ay, aw, ah);
    ctx.clip();
    ctx.drawImage(hero, ax, ay);
    ctx.restore();
  }

  border(ctx, sk);
  head(ctx, sk, "I", "LOOK WHAT I FOUND IN THE SKY");

  // Busur waktu: satu sinar per pengamatan, pada tanggalnya yang sebenarnya.
  const looks = [
    ...(wise ? wise.frames.map((f) => ({ t: year(f.mjd_mid), spherex: false })) : []),
    ...m.windows.map((w) => ({ t: year(w.mjd_mid), spherex: true })),
  ];
  const t0 = Math.floor(Math.min(...looks.map((l) => l.t)));
  const t1 = Math.floor(Math.max(...looks.map((l) => l.t))) + 1;
  const angle = (t: number) => 180 + ((t - t0) / (t1 - t0)) * 180;
  arc(ctx, CX, cy, r + 16, 180, 360, rgb(sk.lo), 1.2);
  arc(ctx, CX, cy, r + 124, 180, 360, rgb(sk.lo), 1.2);
  const quarters = t1 - t0 <= 6 ? 12 : 4; // rentang pendek (SPHEREx saja) ditandai per bulan
  for (let q = 0; q <= (t1 - t0) * quarters; q++) {
    const a = angle(t0 + q / quarters);
    const [x0, y0] = polar(CX, cy, a, r + 16);
    const [x1, y1] = polar(CX, cy, a, r + (q % quarters === 0 ? 30 : 22));
    line(ctx, x0, y0, x1, y1, rgb(sk.lo), 1.2);
  }
  for (const l of looks) {
    const a = angle(l.t);
    const [x0, y0] = polar(CX, cy, a, r + 40);
    const [x1, y1] = polar(CX, cy, a, r + (l.spherex ? 104 : 84));
    line(ctx, x0, y0, x1, y1, rgb(l.spherex ? sk.hi : sk.gold), l.spherex ? 3.2 : 2.2);
    const [tx, ty] = polar(CX, cy, a, r + (l.spherex ? 108 : 90));
    if (l.spherex) disc(ctx, tx, ty, 5.5, rgb(sk.hi));
    else disc(ctx, tx, ty, 4, rgb(sk.top), rgb(sk.gold), 1.6);
  }
  const every = t1 - t0 > 8 ? 5 : 1;
  for (let y = t0 + 1; y < t1; y++) {
    if (y % every) continue;
    const [lx, ly] = polar(CX, cy, angle(y), r + 142);
    text(ctx, String(y), lx, ly + 4, mono(12, 500), rgb(sk.lo), { align: "center" });
  }
  for (const [sign, label] of [
    [-1, String(t0)],
    [1, String(t1)],
  ] as const) {
    line(ctx, CX + sign * (r + 16), cy, CX + sign * (r + 124), cy, rgb(sk.lo), 1.2);
    text(ctx, label, CX + sign * (r + 70), cy + 25, mono(13, 500), rgb(sk.gold), { align: "center" });
  }

  ctx.lineCap = "butt";
  archPath(ctx, ax, ay, aw, ah);
  ctx.strokeStyle = rgb(sk.hi);
  ctx.lineWidth = 3;
  ctx.stroke();
  archPath(ctx, ax - 10, ay - 10, aw + 20, ah + 10);
  ctx.strokeStyle = rgb(sk.lo);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const result = measured(input);
  const nw = wise?.frames.length ?? 0;
  const nv = m.windows.length;
  const band = m.bands.find((b) => b.id === input.frame?.bandId);
  const lines: Line[] = wise
    ? [
        [
          `${nw} WISE pictures stacked, ${Math.floor(year(wise.frames[0].mjd_mid))} to ${Math.floor(year(wise.frames[nw - 1].mjd_mid))}. Anything that moved left a streak.`,
          "text",
        ],
        [result.line, "muted"],
        [`Each ray is one look by a telescope: ${nw} by WISE, then ${nv} by SPHEREx`, "faint"],
      ]
    : [
        [
          `SPHEREx picture${band ? `, ${microns(band.lambda_min, band.lambda_max)}` : ""}${input.frame ? `, ${monthYear(input.frame.mjd)}` : ""}`,
          "text",
        ],
        [result.line, "muted"],
        [`Each ray is one visit by SPHEREx: ${nv} so far`, "faint"],
      ];
  lower(ctx, sk, input, result.title, lines, "Pick any patch of sky and watch it change", index);
}

// ---------- II. Cahayanya ----------
export const STEPS = 72;

export type Slice = { lambda: number; flux: number | null };

/** Semua kunjungan digabung, dibagi rata menjadi irisan panjang gelombang; tiap irisan
 *  adalah median titik bersihnya. Titik yang ditandai SPHEREx (jenuh, piksel rusak)
 *  tidak dipakai di kartu: irisan tanpa titik bersih digambar kosong. */
export function slices(points: SpectrumPoint[]): Slice[] {
  const width = (LAMBDA_MAX - LAMBDA_MIN) / STEPS;
  const cells: number[][] = Array.from({ length: STEPS }, () => []);
  for (const p of points) {
    if (p.flag !== "ok") continue;
    cells[Math.min(STEPS - 1, Math.max(0, Math.floor((p.lambda_um - LAMBDA_MIN) / width)))].push(p.flux_jy);
  }
  return cells.map((cell, i) => {
    const v = cell.sort((a, b) => a - b);
    const k = v.length >> 1;
    return {
      lambda: LAMBDA_MIN + (i + 0.5) * width,
      flux: !v.length ? null : v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2,
    };
  });
}

function voice(ctx: Ctx, sk: Skin, input: CardInput, index: string) {
  const m = input.manifest;
  const cy = 700;
  const R = 178;
  const r0 = 222;
  const reach = 150;
  background(ctx, sk, input.look, input.context, [CX, cy, 600]);

  // Lensa: frame SPHEREx yang asli, 150 detik busur di tengahnya.
  if (input.frame) {
    const img = input.frame.image;
    const w = (Math.min(150, m.fov_arcsec) / m.fov_arcsec) * img.naturalWidth;
    const view = { x: (img.naturalWidth - w) / 2, y: (img.naturalHeight - w) / 2, w, h: w };
    const lens = colorize(img, img.naturalWidth, img.naturalHeight, view, R * 2, R * 2, LUTS[input.look]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(lens, CX - R, cy - R);
    ctx.restore();
  }

  border(ctx, sk);
  head(ctx, sk, "II", "THIS IS WHAT ITS LIGHT LOOKS LIKE");
  disc(ctx, CX, cy, R, undefined, rgb(sk.hi), 3);
  disc(ctx, CX, cy, R + 12, undefined, rgb(sk.lo), 1.2);

  // Sinar: spektrum, searah jarum jam dari atas, 0,75 sampai 5 mikron. Panjang = terang.
  const all = slices(input.points ?? []);
  const values = all.flatMap((s) => (s.flux === null ? [] : [s.flux])).sort((a, b) => a - b);
  const top = Math.max(values[Math.min(values.length - 1, Math.floor(values.length * 0.97))] ?? 1, 1e-12);
  const angle = (lambda: number) => -90 + 12 + ((lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)) * 336;
  for (let i = 0; i < 150; i++) disc(ctx, ...polar(CX, cy, (i * 360) / 150, r0 + reach + 12), 1.3, rgb(sk.lo));
  ctx.lineCap = "round";
  for (const s of all) {
    const a = angle(s.lambda);
    if (s.flux === null) {
      disc(ctx, ...polar(CX, cy, a, r0 + 4), 2.2, undefined, rgb(sk.lo), 1.2);
      continue;
    }
    const length = 6 + Math.min(1, Math.max(0, s.flux / top)) * (reach - 6);
    const [x0, y0] = polar(CX, cy, a, r0);
    const [x1, y1] = polar(CX, cy, a, r0 + length);
    ctx.strokeStyle = rgb(sk.gold);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    disc(ctx, x1, y1, 3, rgb(sk.hi));
  }
  ctx.lineCap = "butt";
  for (const [lambda, label] of [
    [0.75, "0.75"],
    [1, "1"],
    [2, "2"],
    [3, "3"],
    [4, "4"],
    [5, "5 µm"],
  ] as const) {
    const a = angle(lambda);
    const [x0, y0] = polar(CX, cy, a, r0 + reach + 18);
    const [x1, y1] = polar(CX, cy, a, r0 + reach + 30);
    line(ctx, x0, y0, x1, y1, rgb(sk.gold), 1.6);
    const [lx, ly] = polar(CX, cy, a, r0 + reach + 54);
    text(ctx, label, lx, ly + 5, mono(13.5, 500), rgb(sk.gold), { align: "center" });
  }
  sparkle(ctx, CX, cy - r0 - reach - 44, 10, rgb(sk.gold));

  const clean = (input.points ?? []).filter((p) => p.flag === "ok").length;
  lower(
    ctx,
    sk,
    input,
    "THE VOICE",
    [
      [`${clean} clean measurements by SPHEREx, 0.75 to 5 µm`, "text"],
      ["Infrared light, beyond what any eye can see", "muted"],
      ["Each ray is one slice of that light: longer is brighter", "faint"],
    ],
    "Scan to hear this light, then find your own",
    index,
  );
}

/** Kartu yang bisa dibuat dari bundle ini. Kartu cahaya hanya ada kalau spektrumnya
 *  cukup terisi: benda yang terlalu terang untuk SPHEREx tidak diberi sinar kosong. */
export function cardKinds(input: CardInput): CardKind[] {
  const kinds: CardKind[] = [];
  if (input.wiseImages.length || input.frame) kinds.push("wanderer");
  const filled = slices(input.points ?? []).filter((s) => s.flux !== null).length;
  if (input.frame && !input.blended && filled >= STEPS / 3) kinds.push("voice");
  return kinds;
}

/** Lukis satu kartu ke `canvas`. Menunggu huruf termuat dulu: kanvas tidak memicu
 *  pemuatan huruf sendiri dan akan memakai huruf cadangan. */
export async function drawCard(canvas: HTMLCanvasElement, kind: CardKind, input: CardInput): Promise<void> {
  const sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 ″′°µ·−";
  await Promise.all(
    [wide(46, 700), wide(38, 600), wide(16, 650), mono(16.5), mono(16, 500)].map((f) =>
      document.fonts.load(f, sample).catch(() => undefined),
    ),
  );
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const kinds = cardKinds(input);
  const at = kinds.indexOf(kind) + 1;
  const index = kinds.length > 1 ? `CARD ${ROMAN[at]} OF ${ROMAN[kinds.length]}` : "SWARA CARD";
  const sk = SKINS[input.look];
  if (kind === "voice") voice(ctx, sk, input, index);
  else wanderer(ctx, sk, input, index);
}
