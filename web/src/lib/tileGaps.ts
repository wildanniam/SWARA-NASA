// Piksel tanpa data di potongan HiPS SPHEREx.
//
// IRSA menandai piksel yang tidak punya data sebagai transparan. Ada dua macam:
//
//   - Lubang kecil yang dikelilingi data: inti bintang terang yang jenuh. Diisi dengan
//     rata-rata piksel di tepinya, supaya bintang tidak tampak sebagai cincin berlubang.
//   - Celah besar: petak yang tidak punya data SPHEREx pada panjang gelombang ini.
//     Dibiarkan transparan, jadi lapis di bawahnya (peta yang lebih kasar) yang tampak.
//     Tidak ada nilai yang dikarang di sana.

/** Lubang sampai seluas ini (piksel) dianggap inti bintang dan diisi. */
export const SMALL_HOLE_PX = 400;

/** `rgba`: piksel potongan, alpha 0 berarti tanpa data. Mengembalikan pasangan
 *  abu dan alpha per piksel (abu 0 di tempat alpha 0, supaya interpolasi di tepi celah
 *  tetap benar) dan bagian potongan yang tetap tanpa data. */
export function tilePixels(rgba: ArrayLike<number>, width: number, height: number): { data: Uint8Array; gap: number } {
  const n = width * height;
  const data = new Uint8Array(n * 2);
  // 0 = tanpa data dan belum dikunjungi, 1 = ada data, 2 = tanpa data dan sudah dikunjungi.
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] >= 128) {
      state[i] = 1;
      data[i * 2] = rgba[i * 4];
      data[i * 2 + 1] = 255;
    }
  }

  const queue = new Int32Array(n);
  let gapPixels = 0;
  for (let start = 0; start < n; start++) {
    if (state[start] !== 0) continue;
    // Satu lubang: semua piksel tanpa data yang bersambung (atas, bawah, kiri, kanan).
    let size = 0;
    let rim = 0;
    let rimCount = 0;
    state[start] = 2;
    queue[size++] = start;
    for (let at = 0; at < size; at++) {
      const i = queue[at];
      const x = i % width;
      for (let side = 0; side < 4; side++) {
        if ((side === 0 && x === 0) || (side === 1 && x === width - 1)) continue;
        const j = side === 0 ? i - 1 : side === 1 ? i + 1 : side === 2 ? i - width : i + width;
        if (j < 0 || j >= n) continue;
        if (state[j] === 1) {
          rim += data[j * 2];
          rimCount++;
        } else if (state[j] === 0) {
          state[j] = 2;
          queue[size++] = j;
        }
      }
    }
    if (size <= SMALL_HOLE_PX && rimCount) {
      const fill = Math.round(rim / rimCount);
      for (let at = 0; at < size; at++) {
        data[queue[at] * 2] = fill;
        data[queue[at] * 2 + 1] = 255;
      }
    } else {
      gapPixels += size;
    }
  }
  return { data, gap: gapPixels / n };
}
