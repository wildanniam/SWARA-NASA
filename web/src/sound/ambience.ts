// Orkestra sintetis untuk memberi bobot dan ruang pada pemutaran data.
// Semua lapisan dibuat lokal; tidak memakai cuplikan atau melodi film.
import { AMBIENCE } from "./mapping";

type Run = {
  master: GainNode;
  duck: GainNode;
  nodes: AudioScheduledSourceNode[];
  timer?: ReturnType<typeof setTimeout>;
};

let current: Run | undefined;
const impulseCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function makeImpulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  let buffers = impulseCache.get(ctx);
  if (!buffers) {
    buffers = new Map();
    impulseCache.set(ctx, buffers);
  }
  const cached = buffers.get(length);
  if (cached) return cached;

  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let state = 0x51f15e + channel * 97;
    for (let i = 0; i < length; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const decay = Math.pow(1 - i / length, 2.8);
      samples[i] = (state / 0xffffffff * 2 - 1) * decay;
    }
  }
  buffers.set(length, buffer);
  return buffer;
}

/** Reverb dan bed lama yang dipakai oleh pemutar kartu berbagi mesin suara ini. */
export function makeSpaceImpulse(ctx: BaseAudioContext, seconds = AMBIENCE.reverbSeconds): AudioBuffer {
  return makeImpulseResponse(ctx, seconds);
}

/** Jadwalkan bed sintetis ke bus pemanggil (misalnya mixer suara kartu). */
export function scheduleAmbience(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  duration: number,
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  if (duration <= 0) return sources;

  const tone = (
    hz: number,
    from: number,
    length: number,
    waveform: OscillatorType,
    peak: number,
    attack: number,
    release: number,
    panValue = 0,
    cutoff?: number,
  ) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.type = waveform;
    osc.frequency.value = hz;
    pan.pan.value = panValue;
    let node: AudioNode = osc;
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      osc.connect(filter);
      node = filter;
    }
    const start = Math.max(ctx.currentTime + 0.005, from);
    const end = Math.max(start + 0.08, from + length);
    const attackTime = Math.min(attack, length * 0.45);
    const releaseTime = Math.min(release, Math.max(0.04, length - attackTime));
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + attackTime);
    env.gain.setValueAtTime(peak, Math.max(start + attackTime, end - releaseTime));
    env.gain.linearRampToValueAtTime(0, end);
    node.connect(env).connect(pan).connect(out);
    osc.start(start);
    osc.stop(end + 0.03);
    sources.push(osc);
  };

  const bedLength = duration + AMBIENCE.releaseSeconds;
  for (const [index, hz] of AMBIENCE.droneHz.entries()) {
    tone(hz, at, bedLength, "sine", AMBIENCE.gain * 0.5,
      AMBIENCE.buildSeconds, AMBIENCE.releaseSeconds, index === 0 ? -0.25 : 0.25);
  }
  for (const hz of AMBIENCE.progression[0]) {
    tone(hz, at, bedLength, "triangle", AMBIENCE.gain * 0.065,
      AMBIENCE.buildSeconds * 1.4, AMBIENCE.releaseSeconds, 0, 720);
  }
  const pianoNotes = [AMBIENCE.openingChord, ...AMBIENCE.progression].flatMap((chord) => chord.slice(0, 3));
  for (let t = AMBIENCE.pianoStartSeconds, i = 0; t < duration; t += AMBIENCE.pianoIntervalSeconds, i++) {
    tone(pianoNotes[i % pianoNotes.length], at + t,
      Math.min(AMBIENCE.pianoTailSeconds, duration - t), "sine", AMBIENCE.gain * AMBIENCE.pianoGain * AMBIENCE.pianoFundamentalMix,
      0.018, 2.2, i % 2 ? 0.18 : -0.18);
  }
  return sources;
}

function stopRun(run: Run, ctx: AudioContext, immediate: boolean) {
  if (run.timer) clearTimeout(run.timer);
  const now = ctx.currentTime;
  const release = immediate ? 0.025 : AMBIENCE.releaseSeconds;
  run.master.gain.cancelScheduledValues(now);
  run.master.gain.setValueAtTime(run.master.gain.value, now);
  run.master.gain.linearRampToValueAtTime(0, now + release);
  run.timer = setTimeout(() => {
    for (const node of run.nodes) {
      try { node.stop(); } catch { /* already stopped */ }
    }
  }, release * 1000 + 100);
}

function tone(
  ctx: AudioContext,
  run: Run,
  hz: number,
  from: number,
  length: number,
  level: number,
  attack: number,
  release: number,
  waveform: OscillatorType = "sine",
  filterHz?: number,
  panValue = 0,
  detuneCents = 0,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  osc.type = waveform;
  osc.frequency.value = hz;
  osc.detune.value = detuneCents;
  pan.pan.value = panValue;
  const start = Math.max(ctx.currentTime + 0.005, from);
  const end = Math.max(start + 0.08, from + length);
  const attackTime = Math.min(Math.max(0.015, attack), Math.max(0.015, end - start - 0.08));
  const releaseTime = Math.min(Math.max(0.04, release), Math.max(0.04, end - start - attackTime));
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + attackTime);
  gain.gain.setValueAtTime(level, Math.max(start + attackTime, end - releaseTime));
  gain.gain.linearRampToValueAtTime(0, end);
  if (filterHz) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    filter.Q.value = 0.45;
    osc.connect(filter).connect(gain);
  } else osc.connect(gain);
  gain.connect(pan).connect(run.master);
  osc.start(start);
  osc.stop(end + 0.02);
  run.nodes.push(osc);
}

/** Noise berfilter yang berayun sangat pelan untuk memberi kesan ruang kosong. */
function wind(ctx: AudioContext, run: Run, from: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 0x37a24c1;
  for (let i = 0; i < samples.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    samples[i] = (state / 0xffffffff) * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const highPass = ctx.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = AMBIENCE.windHighPassHz;
  highPass.Q.value = 0.35;
  const lowPass = ctx.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = AMBIENCE.windLowPassHz;
  lowPass.Q.value = 0.45;
  const level = ctx.createGain();
  const sway = ctx.createOscillator();
  sway.type = "sine";
  sway.frequency.value = AMBIENCE.windBreathHz;
  const swayDepth = ctx.createGain();
  const start = Math.max(ctx.currentTime + 0.005, from);
  const attackEnd = start + AMBIENCE.windAttackSeconds;
  level.gain.setValueAtTime(0, start);
  level.gain.linearRampToValueAtTime(AMBIENCE.windGain * 0.68, attackEnd);
  swayDepth.gain.setValueAtTime(0, start);
  swayDepth.gain.linearRampToValueAtTime(AMBIENCE.windGain * AMBIENCE.windBreathDepth, attackEnd);
  source.connect(highPass).connect(lowPass).connect(level).connect(run.master);
  sway.connect(swayDepth).connect(level.gain);
  source.start(start);
  sway.start(start);
  run.nodes.push(source, sway);
}

/** Mulai satu lapisan ambience dan jadwalkan harmoni sepanjang pemutaran. */
export function startAmbience(ctx: AudioContext, at: number, duration: number, output: AudioNode = ctx.destination) {
  if (current) stopRun(current, ctx, true);

  const master = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const duck = ctx.createGain();
  duck.gain.value = 1;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulseResponse(ctx, AMBIENCE.reverbSeconds);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = AMBIENCE.compressorThresholdDb;
  compressor.knee.value = 16;
  compressor.ratio.value = AMBIENCE.compressorRatio;
  compressor.attack.value = 0.025;
  compressor.release.value = 0.42;
  master.gain.setValueAtTime(0, at);
  master.gain.linearRampToValueAtTime(AMBIENCE.gain, at + AMBIENCE.buildSeconds);
  dry.gain.value = AMBIENCE.dryMix;
  wet.gain.value = AMBIENCE.reverbMix;
  master.connect(duck).connect(compressor);
  compressor.connect(dry).connect(output);
  compressor.connect(reverb).connect(wet).connect(output);
  const run: Run = { master, duck, nodes: [] };
  current = run;
  wind(ctx, run, at);

  // Kontrabas dan cello memberi dasar yang terasa penuh, dengan sebaran stereo lembut.
  tone(ctx, run, AMBIENCE.droneHz[0], at, duration + AMBIENCE.releaseSeconds,
    AMBIENCE.droneGain * AMBIENCE.droneFundamentalMix, AMBIENCE.droneAttackSeconds, 4, "sine", undefined, -0.22);
  tone(ctx, run, AMBIENCE.droneHz[1], at, duration + AMBIENCE.releaseSeconds,
    AMBIENCE.droneGain * AMBIENCE.droneUpperMix, AMBIENCE.droneAttackSeconds + 1.2, 4, "sine", undefined, 0.22);

  const chordStep = AMBIENCE.chordSeconds - AMBIENCE.chordOverlapSeconds;
  const endAt = at + duration;
  for (let chordAt = at, index = 0; chordAt < endAt; chordAt += chordStep, index++) {
    const chord = index === 0
      ? AMBIENCE.openingChord
      : AMBIENCE.progression[(index - 1) % AMBIENCE.progression.length];
    const remaining = Math.max(0.8, endAt - chordAt);
    const chordLength = Math.min(AMBIENCE.chordSeconds, remaining + AMBIENCE.releaseSeconds);
    for (const [voice, hz] of chord.entries()) {
      // Pad organ menyatukan akord; tiap nada punya ruang stereo yang kecil.
      tone(ctx, run, hz, chordAt, chordLength,
        AMBIENCE.padGain * (voice === 0 ? AMBIENCE.organRootMix : AMBIENCE.organUpperMix),
        5.2, 4.2, "triangle", 1500, (voice - 1) * 0.12);

      // String section: tiga nada sedikit berbeda membuat bunyi bowed yang lebar.
      for (const [stringIndex, detune] of AMBIENCE.stringDetuneCents.entries()) {
        const spread = (stringIndex - 1) * AMBIENCE.stringPan;
        tone(ctx, run, hz * 2, chordAt + AMBIENCE.stringPadDelaySeconds,
          chordLength - AMBIENCE.stringPadDelaySeconds,
          (AMBIENCE.stringPadGain * AMBIENCE.stringHarmonicMix) / AMBIENCE.stringDetuneCents.length,
          AMBIENCE.stringPadAttackSeconds, 4.3, "sawtooth", AMBIENCE.stringFilterHz, spread, detune);
      }
    }

    // Horn rendah masuk belakangan untuk membuat akord terasa seperti ansambel.
    tone(ctx, run, chord[0], chordAt + 0.7, chordLength - 0.7,
      AMBIENCE.brassGain * 0.42, AMBIENCE.brassAttackSeconds, 4.5, "sawtooth", AMBIENCE.brassFilterHz, -0.1);
    tone(ctx, run, chord[1] * 1.5, chordAt + 1.1, chordLength - 1.1,
      AMBIENCE.brassGain * 0.28, AMBIENCE.brassAttackSeconds, 4.5, "sawtooth", AMBIENCE.brassFilterHz, 0.1);
  }

  const pianoNotes = [AMBIENCE.openingChord, ...AMBIENCE.progression].flatMap((chord) => chord.slice(0, 3));
  for (let pianoAt = at + AMBIENCE.pianoStartSeconds, index = 0; pianoAt < endAt; pianoAt += AMBIENCE.pianoIntervalSeconds, index++) {
    const hz = pianoNotes[index % pianoNotes.length] * (index % 3 === 2 ? 2 : 1);
    const decay = AMBIENCE.pianoTailSeconds;
    tone(ctx, run, hz, pianoAt, decay, AMBIENCE.pianoGain * AMBIENCE.pianoFundamentalMix, 0.012, decay - 0.08, "sine");
    tone(ctx, run, hz * 2.01, pianoAt, decay * 0.65,
      AMBIENCE.pianoGain * AMBIENCE.pianoOvertoneMix, 0.008, decay * 0.55, "sine");
  }

  // Satu tic lembut tiap beberapa detik; reverb panjang ambience memberi ekor
  // gema tanpa membuat bunyi latarnya terasa ritmis atau keras.
  for (let tickAt = at + AMBIENCE.tickStartSeconds; tickAt < endAt; tickAt += AMBIENCE.tickIntervalSeconds) {
    tone(ctx, run, AMBIENCE.tickHz, tickAt, AMBIENCE.tickLengthSeconds,
      AMBIENCE.tickGain, AMBIENCE.tickAttackSeconds, AMBIENCE.tickReleaseSeconds,
      "sine", AMBIENCE.tickFilterHz);
  }

  // Libère le bus après la dernière visite, en laissant mourir la réverbération.
  run.timer = setTimeout(() => {
    if (current === run) stopRun(run, ctx, false);
  }, Math.max(0, (at + duration - ctx.currentTime) * 1000));
}

export function stopAmbience(ctx: AudioContext, immediate = false) {
  if (!current) return;
  const run = current;
  current = undefined;
  stopRun(run, ctx, immediate);
}

/** Turunkan bed saat lapisan spektrum berbunyi, lalu pulihkan lembut setelah nada selesai. */
export function duckAmbience(at: number, duration: number) {
  if (!current) return;
  const gain = current.duck.gain;
  gain.cancelScheduledValues(at);
  gain.setTargetAtTime(AMBIENCE.spectrumDuckGain, at, AMBIENCE.spectrumDuckAttackSeconds);
  gain.setTargetAtTime(1, at + Math.max(0.04, duration), AMBIENCE.spectrumDuckReleaseSeconds);
}
