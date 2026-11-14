// Pemilih mode suara: radiogroup asli supaya navigasi panah, screen reader,
// sentuh, dan fokus jelas didapat dari browser tanpa kode khusus.

import { MODES, type ModeId } from "../sound/modes";

type Props = {
  mode: ModeId;
  onMode: (id: ModeId) => void;
};

export function ModeSwitch({ mode, onMode }: Props) {
  return (
    <div className="modes" role="radiogroup" aria-label="Sound mode">
      {MODES.map((m) => (
        <label key={m.id} className="mode" data-active={m.id === mode}>
          <input
            type="radio"
            name="sound-mode"
            value={m.id}
            checked={m.id === mode}
            onChange={() => onMode(m.id)}
          />
          <span className="mode-dot" aria-hidden="true" />
          <span>{m.label}</span>
          <kbd aria-hidden="true">Alt+{m.key.toUpperCase()}</kbd>
        </label>
      ))}
    </div>
  );
}
