const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** MJD -> "Aug 2025" */
export function monthYear(mjd: number): string {
  const d = new Date((mjd - 40587) * 86400000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2025-08-15" -> "15 Aug 2025" */
export function dayMonthYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const microns = (min: number, max: number) => `${min.toFixed(2)}–${max.toFixed(2)} µm`;

export function coord(ra: number, dec: number): string {
  return `RA ${ra.toFixed(4)}°  Dec ${dec >= 0 ? "+" : "−"}${Math.abs(dec).toFixed(4)}°`;
}

/** Nama singkat untuk koordinat bebas: "133.7951° −7.2451°" */
export function coordShort(ra: number, dec: number): string {
  return `${ra.toFixed(4)}° ${dec >= 0 ? "+" : "−"}${Math.abs(dec).toFixed(4)}°`;
}

/** Pergeseran dalam kata-kata: "9.9″ north, 1.9″ west" */
export function shiftWords(east: number, north: number): string {
  const parts: string[] = [];
  if (Math.abs(north) >= 0.5) parts.push(`${Math.abs(north).toFixed(1)}″ ${north > 0 ? "north" : "south"}`);
  if (Math.abs(east) >= 0.5) parts.push(`${Math.abs(east).toFixed(1)}″ ${east > 0 ? "east" : "west"}`);
  return parts.join(", ");
}
