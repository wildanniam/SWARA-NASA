// Menyamakan nada citra WISE dengan frame SPHEREx, untuk bundle lama.
//
// Bundle baru sudah ditulis pipeline dengan aturan ini (wise.py, `matched: true`),
// dari rentang terang yang lebih lebar. Yang di sini adalah padanan terbaiknya untuk
// citra lama, yang terpotong di terang maksimumnya.
//
// Frame SPHEREx dibuat pipeline dengan regangan asinh di atas latar yang sudah
// dikurangi: lutut = 3 kali derau latar. Citra WISE dari layanan WiseView datang
// dengan regangan linier dan latar abu-abu, jadi saat deretan berpindah dari WISE
// ke SPHEREx seluruh lensa meloncat dari abu-abu ke hitam. Di sini aturan yang sama
// diterapkan ke citra WISE saat dilukis: latar (median) dikurangi, lalu asinh dengan
// lutut 3 kali derau. Ini hanya mengubah tampilan; citra WISE memang tidak diukur.
//
// Citra WISE juga lebih tajam (piksel 2,75 detik busur, lebar bintang sekitar 6,4)
// daripada frame SPHEREx (piksel 6,15, lebar bintang sekitar 9,5 setelah disusun),
// dan deraunya tampak berbintik. Sebelum diregangkan ia dihaluskan sedikit supaya
// lebar bintangnya setara: akar dari (9,5 kuadrat kurang 6,4 kuadrat) dibagi 2,355,
// kira-kira 3 detik busur.

/** Penghalusan citra WISE, detik busur (simpangan baku Gauss). */
export const WISE_SOFTEN_ARCSEC = 3;

type Tone = { sky: number; knee: number; lut: Uint8ClampedArray };

const cache = new Map<string, Tone>();
let scratch: HTMLCanvasElement | undefined;

/** Kurva nada untuk satu tempat, dihitung sekali dari citra WISE pertamanya dan
 *  dipakai untuk semua epoch, supaya terang antar epoch tetap bisa dibandingkan. */
export function wiseTone(key: string, first: HTMLImageElement, softenPx: number): Uint8ClampedArray {
  const known = cache.get(key);
  if (known) return known.lut;

  scratch ??= document.createElement("canvas");
  const w = first.naturalWidth;
  const h = first.naturalHeight;
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  // Derau diukur pada citra yang sudah dihaluskan, karena itulah yang ditampilkan.
  ctx.filter = softenPx > 0 ? `blur(${softenPx.toFixed(2)}px)` : "none";
  ctx.drawImage(first, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const counts = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) counts[data[i]]++;
  const total = w * h;
  const median = (hist: Uint32Array) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen * 2 >= total) return v;
    }
    return 255;
  };
  const sky = median(counts);
  // Derau dari simpangan mutlak median, seperti di pipeline.
  const spread = new Uint32Array(256);
  for (let v = 0; v < 256; v++) spread[Math.abs(v - sky)] += counts[v];
  const knee = Math.max(3 * 1.4826 * median(spread), 2);

  const lut = new Uint8ClampedArray(256);
  const top = Math.asinh((255 - sky) / knee);
  for (let v = 0; v < 256; v++) lut[v] = Math.round((255 * Math.asinh(Math.max(0, v - sky) / knee)) / top);
  cache.set(key, { sky, knee, lut });
  return lut;
}
