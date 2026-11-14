import { useEffect, useState } from "react";
import { alongArc, easeSlew } from "../lib/skygeo";

export type Slew = {
  /** Tempat yang dituju. */
  id: string;
  from: { ra: number; dec: number };
  to: { ra: number; dec: number };
  /** Jarak sudut di langit, derajat. */
  degrees: number;
  ms: number;
  startedAt: number;
};

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`;

/** Pembacaan selama teleskop berpindah: posisi yang sedang dilewati di sepanjang
 *  busur lingkaran besar dari tempat lama ke tempat baru, dan sisa jaraknya. */
export function SlewReadout({ slew }: { slew: Slew }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = Math.min(1, (performance.now() - slew.startedAt) / slew.ms);
      setT(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [slew]);

  const k = easeSlew(t);
  const at = alongArc(slew.from, slew.to, k);
  return (
    <>
      <b>Slewing</b>
      <span>
        RA {at.ra.toFixed(2)}° Dec {signed(at.dec)}
      </span>
      <span>{(slew.degrees * (1 - k)).toFixed(1)}° to go</span>
    </>
  );
}
