// Logo SWARA: tanda (cakram ambar dengan bintang empat sudut berlubang) dan nama yang
// digambar satu garis. Bentuknya sama dengan public/favicon.svg dan tanda di kartu berbagi
// (lib/card.ts); kalau diubah, ubah ketiganya.

const star = (x: number, y: number, r: number, k: number) => {
  const q = r * k;
  return `M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}Z`;
};

/** Bintang di tengah tanda, dalam kotak 64 x 64. */
export const MARK_STAR = star(32, 32, 19, 0.17);

/** Garis nama SWARA dalam kotak 212 x 48 (mulai di x = -4), dan bintang di A pertama. */
export const WORD_PATHS = [
  "M30 8H13a8 8 0 0 0 0 16h10a8 8 0 0 1 0 16H4",
  "M44 8L54 40L64 16L74 40L84 8",
  "M96 40L111 8L126 40",
  "M138 40V8H152a9 9 0 0 1 0 18H138M151 26L162 40",
  "M172 40L187 8L202 40",
];
export const WORD_STAR = star(111, 31, 6.5, 0.22);

/** Tanda: cakram ambar, bintangnya dilubangi sehingga latar di belakangnya terlihat. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <mask id="logo-hole">
        <rect width="64" height="64" fill="#fff" />
        <path d={MARK_STAR} fill="#000" />
      </mask>
      <circle cx="32" cy="32" r="30" fill="var(--accent)" mask="url(#logo-hole)" />
    </svg>
  );
}

/** Nama SWARA satu garis. Warna garis mengikuti warna teks di sekitarnya. */
export function Wordmark({ height = 16 }: { height?: number }) {
  return (
    <svg className="logo-word" height={height} width={(212 / 48) * height} viewBox="-4 0 212 48" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="5.8" strokeLinecap="round" strokeLinejoin="round">
        {WORD_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={WORD_STAR} fill="var(--accent)" />
    </svg>
  );
}
