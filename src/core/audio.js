// Procedural WebAudio — every sound is synthesized, no audio assets.
// Context is created lazily and resumed on first user gesture (autoplay policy).

export function createAudio(settings) {
  let ctx = null;
  let master, sfxBus, ambientBus, musicBus;
  let noiseBuffer = null;
  const loops = new Map(); // name -> {stop()}

  function ensure() {
    if (ctx) return ctx.state === 'running';
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    ambientBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    ambientBus.connect(master);
    musicBus.connect(master);
    applyVolumes();
    return ctx.state === 'running';
  }

  function applyVolumes() {
    if (!ctx) return;
    const s = settings.get();
    master.gain.value = s.volume;
    sfxBus.gain.value = s.sfxVolume;
    ambientBus.gain.value = s.ambientVolume;
    musicBus.gain.value = s.ambientVolume;
  }

  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function ok() {
    return ctx && ctx.state === 'running';
  }

  // ---------- one-shots ----------

  function uiClick() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.05);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g).connect(sfxBus);
    osc.start(t); osc.stop(t + 0.08);
  }

  function camBlip() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(bp).connect(g).connect(sfxBus);
    src.start(t); src.stop(t + 0.16);
  }

  function doorSlam() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(lp).connect(g).connect(sfxBus);
    src.start(t); src.stop(t + 0.32);
    // metallic clang layer
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.4, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g2).connect(sfxBus);
    osc.start(t); osc.stop(t + 0.24);
  }

  function footstepThud() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g).connect(sfxBus);
    osc.start(t); osc.stop(t + 0.17);
  }

  function scream() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const dur = 1.25;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;

    const tremolo = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(tremolo.gain);
    tremolo.gain.value = 0.6;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.9, t);
    out.gain.setValueAtTime(0.9, t + dur - 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    shaper.connect(tremolo).connect(out).connect(sfxBus);

    for (const detune of [-45, 0, 60]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(780, t);
      osc.frequency.exponentialRampToValueAtTime(190, t + dur);
      const g = ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g).connect(shaper);
      osc.start(t); osc.stop(t + dur);
    }
    // noise breath layer
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(ng).connect(sfxBus);
    src.start(t); src.stop(t + dur);
    lfo.start(t); lfo.stop(t + dur);
  }

  function chime6AM() {
    if (!ok()) return;
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99]; // C5 E5 G5 C6 G5
    notes.forEach((f, i) => {
      const t = t0 + i * 0.35;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(g).connect(musicBus);
      osc.start(t); osc.stop(t + 1.5);
      // shimmer partial
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = f * 2.01;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc2.connect(g2).connect(musicBus);
      osc2.start(t); osc2.stop(t + 1);
    });
  }

  function powerOutDrone() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    osc.connect(lp).connect(g).connect(sfxBus);
    osc.start(t); osc.stop(t + 2.5);
  }

  // ---------- loops ----------

  function startLoop(name, builder) {
    if (!ok() || loops.has(name)) return;
    const handle = builder();
    if (handle) loops.set(name, handle);
  }

  function stopLoop(name) {
    const h = loops.get(name);
    if (h) { try { h.stop(); } catch { /* already stopped */ } loops.delete(name); }
  }

  function stopAllLoops() {
    for (const name of [...loops.keys()]) stopLoop(name);
  }

  function fanHum() {
    startLoop('fan', () => {
      const src = ctx.createBufferSource();
      src.buffer = getNoise();
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 120; bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      const hum = ctx.createOscillator();
      hum.type = 'sine'; hum.frequency.value = 60;
      const hg = ctx.createGain(); hg.gain.value = 0.05;
      src.connect(bp).connect(g).connect(ambientBus);
      hum.connect(hg).connect(ambientBus);
      src.start(); hum.start();
      return { stop() { src.stop(); hum.stop(); } };
    });
  }

  function lightBuzz() {
    startLoop('buzz', () => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 120;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 800;
      const g = ctx.createGain(); g.gain.value = 0.10;
      osc.connect(hp).connect(g).connect(sfxBus);
      osc.start();
      return { stop() { osc.stop(); } };
    });
  }
  const stopLightBuzz = () => stopLoop('buzz');

  function musicBox() {
    startLoop('musicbox', () => {
      // 16-step minor melody, FM pluck voice ("my grandfather's clock" vibe)
      const steps = [440, 0, 523.25, 440, 349.23, 0, 440, 0, 329.63, 0, 349.23, 329.63, 293.66, 0, 220, 0];
      let i = 0;
      const interval = setInterval(() => {
        if (!ok()) return;
        const f = steps[i % steps.length];
        i++;
        if (!f) return;
        const t = ctx.currentTime;
        const carrier = ctx.createOscillator();
        carrier.type = 'sine'; carrier.frequency.value = f * 2;
        const mod = ctx.createOscillator();
        mod.frequency.value = f * 7;
        const modGain = ctx.createGain(); modGain.gain.setValueAtTime(f * 1.5, t);
        modGain.gain.exponentialRampToValueAtTime(1, t + 0.4);
        mod.connect(modGain).connect(carrier.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        carrier.connect(g).connect(musicBus);
        carrier.start(t); carrier.stop(t + 0.65);
        mod.start(t); mod.stop(t + 0.65);
      }, 340);
      return { stop() { clearInterval(interval); } };
    });
  }

  function menuTheme() {
    startLoop('menu', () => {
      // slow detuned minor pad: A2 + C3 + E3, gently pulsing
      const freqs = [110, 130.81, 164.81];
      const oscs = [];
      const g = ctx.createGain();
      g.gain.value = 0.0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain).connect(g.gain);
      g.gain.setTargetAtTime(0.09, ctx.currentTime, 2.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 500;
      g.connect(lp).connect(musicBus);
      for (const f of freqs) {
        for (const det of [-6, 5]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          const og = ctx.createGain(); og.gain.value = 0.16;
          o.connect(og).connect(g);
          o.start();
          oscs.push(o);
        }
      }
      lfo.start();
      return { stop() { oscs.forEach(o => o.stop()); lfo.stop(); } };
    });
  }

  const audio = {
    get context() { return ctx; },
    applyVolumes,
    stopAllLoops,
    stopLoop,
    sfx: {
      uiClick, camBlip, doorSlam, footstepThud, scream, chime6AM, powerOutDrone,
      lightBuzz, stopLightBuzz,
    },
    ambient: { fanHum, stopFan: () => stopLoop('fan'), musicBox, stopMusicBox: () => stopLoop('musicbox'), menuTheme, stopMenuTheme: () => stopLoop('menu') },
  };

  // Unlock on first gesture.
  const unlock = () => {
    ensure();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  return audio;
}
