/**
 * 多维声景 Web Audio API 实时程序化合成引擎
 * 覆盖「时间变换 / 情绪变换 / 空间变换」三大维度 × 四阶状态共 12 层差异化声场
 * 零外部音频文件依赖，支持平滑维度交叉切换、自动节点回收与交互清磬/撞击共鸣
 */
(function (global) {
  'use strict';

class DimensionalSoundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.noiseBuffer = null;

    this.dimensionId = 'time';
    this.progress = 0;

    // 每个维度维护 1 个总线增益和 4 个阶段子声道增益
    this.dimGroups = {
      time: { groupGain: null, stageGains: [null, null, null, null] },
      mood: { groupGain: null, stageGains: [null, null, null, null] },
      space: { groupGain: null, stageGains: [null, null, null, null] },
    };

    this.schedulerTimer = null;
    this.lastStageIndex = 0;
    this.lastChimeTime = 0;
  }

  /**
   * 开关多维声景（在用户交互手势内首次触发）
   * @returns {Promise<boolean>}
   */
  async toggle() {
    if (!this.enabled) {
      await this.#initAudio();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.enabled = true;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.30, now, 0.35);
      this.#syncGroupGains(now);
      this.updateProgress(this.progress);
      this.#startEventLoop();
      return true;
    } else {
      this.enabled = false;
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
      }
      this.#stopEventLoop();
      return false;
    }
  }

  /**
   * 切换当前维度，平滑交叉淡入淡出各维度声景总线
   * @param {'time'|'mood'|'space'} dimId
   */
  setDimension(dimId) {
    if (this.dimensionId === dimId) return;
    this.dimensionId = dimId;
    this.lastStageIndex = Math.round(this.progress * 3.0);
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    this.#syncGroupGains(now);
    this.updateProgress(this.progress);
  }

  /**
   * 根据滑块位置平滑调节当前维度 4 阶声道权重
   * @param {number} progress [0, 1]
   */
  updateProgress(progress) {
    this.progress = Math.max(0, Math.min(1, progress));
    if (!this.ctx || !this.enabled) return;

    const group = this.dimGroups[this.dimensionId];
    if (!group) return;

    const s = this.progress * 3.0;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const dist = Math.abs(s - i);
      const weight = Math.max(0, 1 - dist);
      const smoothWeight = Math.sin((weight * Math.PI) / 2);
      if (group.stageGains[i]) {
        group.stageGains[i].gain.setTargetAtTime(smoothWeight, now, 0.09);
      }
    }

    // 跨越四阶主节点时轻触琉璃微响（带 360ms 防连响节流）
    const nearest = Math.round(s);
    const nowMs = performance.now();
    if (nearest !== this.lastStageIndex && Math.abs(s - nearest) < 0.08) {
      this.lastStageIndex = nearest;
      if (nowMs - this.lastChimeTime > 360) {
        this.lastChimeTime = nowMs;
        this.playGlassChime(nearest);
      }
    }
  }

  /**
   * 播放随维度音阶定制的清透琉璃触响
   * @param {number} stageIdx 0..3
   */
  playGlassChime(stageIdx = 0) {
    if (!this.ctx || !this.enabled) return;
    const scales = {
      // 时间：古韵五声音阶（D5, E5, G5, A5）
      time: [587.33, 659.25, 783.99, 880.0],
      // 情绪：温柔抒情大七和弦（C5, E5, G5, B5）
      mood: [523.25, 659.25, 783.99, 987.77],
      // 空间：空灵利底亚太空音阶（F#5, G5, B5, D6）
      space: [739.99, 783.99, 987.77, 1174.66],
    };
    const scale = scales[this.dimensionId] || scales.time;
    const freq = scale[stageIdx % scale.length];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = this.dimensionId === 'space' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.003, now + 0.5);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.045, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.72);
  }

  /**
   * 滑块撞击胶囊端壁时的物理共鸣声
   * @param {number} intensity [0, 1]
   */
  playImpactResonance(intensity = 0.6) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    const baseF = this.dimensionId === 'space' ? 196.0 : this.dimensionId === 'mood' ? 246.94 : 293.66;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseF * 1.15, now);
    osc.frequency.exponentialRampToValueAtTime(baseF, now + 0.14);

    const amp = Math.min(0.08, 0.025 + intensity * 0.055);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.45);
  }

  #syncGroupGains(now) {
    for (const [key, grp] of Object.entries(this.dimGroups)) {
      if (grp.groupGain) {
        const target = key === this.dimensionId ? 1.0 : 0.0001;
        grp.groupGain.gain.setTargetAtTime(target, now, 0.22);
      }
    }
  }

  async #initAudio() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;
    this.masterGain.connect(this.ctx.destination);

    // 预生成 4 秒无接缝双声道粉红噪声缓冲
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = noiseBuffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      }
      const fadeLen = Math.floor(sampleRate * 0.08);
      for (let i = 0; i < fadeLen; i++) {
        const ratio = i / fadeLen;
        data[i] *= ratio;
        data[length - 1 - i] *= ratio;
      }
    }
    this.noiseBuffer = noiseBuffer;

    this.#buildTimeDimension();
    this.#buildMoodDimension();
    this.#buildSpaceDimension();
  }

  #createStageGroup(dimId) {
    const groupGain = this.ctx.createGain();
    groupGain.gain.value = dimId === this.dimensionId ? 1.0 : 0.0001;
    groupGain.connect(this.masterGain);
    this.dimGroups[dimId].groupGain = groupGain;

    for (let i = 0; i < 4; i++) {
      const sg = this.ctx.createGain();
      sg.gain.value = i === 0 ? 1 : 0;
      sg.connect(groupGain);
      this.dimGroups[dimId].stageGains[i] = sg;
    }
    return this.dimGroups[dimId].stageGains;
  }

  #buildTimeDimension() {
    const stages = this.#createStageGroup('time');
    // 0: 太初 — 山谷清晨微风 + 海湾轻浪
    this.#attachFilteredNoise('bandpass', 360, 0.85, 0.52, stages[0], 0.08);
    this.#attachFilteredNoise('lowpass', 220, 1.1, 0.42, stages[0], 0.14);

    // 1: 盛世 — 温暖水上丝竹暖雾感 + 微风
    this.#attachFilteredNoise('bandpass', 640, 0.8, 0.46, stages[1], 0.11);
    this.#attachSoftPad(293.66, 0.032, 'sine', stages[1]); // D4 温润长鸣

    // 2: 赛博 — 密集都市细雨 + 未来低频 Synth Pad
    this.#attachFilteredNoise('bandpass', 1850, 0.65, 0.44, stages[2], 0.18);
    this.#attachFilteredNoise('lowpass', 280, 1.3, 0.48, stages[2], 0.07);
    this.#attachSoftPad(130.81, 0.045, 'triangle', stages[2]); // C3 低频电子垫音

    // 3: 星海 — 极寂深空寒风 + 星尘谐振泛音
    this.#attachFilteredNoise('lowpass', 190, 1.9, 0.72, stages[3], 0.05);
    this.#attachSoftPad(220.0, 0.025, 'sine', stages[3]);
    this.#attachSoftPad(329.63, 0.018, 'sine', stages[3]);
  }

  #buildMoodDimension() {
    const stages = this.#createStageGroup('mood');
    // 0: 澄明 — 轻盈空气微风
    this.#attachFilteredNoise('bandpass', 520, 0.7, 0.45, stages[0], 0.09);

    // 1: 炽烈 — 温暖日冕大三度暖音垫 + 微噪热浪
    this.#attachFilteredNoise('bandpass', 880, 0.75, 0.35, stages[1], 0.22);
    this.#attachSoftPad(196.0, 0.042, 'triangle', stages[1]); // G3
    this.#attachSoftPad(246.94, 0.028, 'sine', stages[1]);    // B3

    // 2: 孤寂 — 立体玻璃窗雨声 + 深沉低音忧郁大提琴共鸣
    this.#attachFilteredNoise('bandpass', 1550, 0.55, 0.55, stages[2], 0.12);
    this.#attachFilteredNoise('bandpass', 3200, 1.2, 0.18, stages[2], 0.29);
    this.#attachSoftPad(110.0, 0.055, 'triangle', stages[2]); // A2 低沉共鸣

    // 3: 梦境 — 失重薄膜空间呼吸感
    this.#attachFilteredNoise('bandpass', 980, 2.4, 0.38, stages[3], 0.32);
    this.#attachSoftPad(261.63, 0.024, 'sine', stages[3]);
    this.#attachSoftPad(392.0, 0.018, 'sine', stages[3]);
  }

  #buildSpaceDimension() {
    const stages = this.#createStageGroup('space');
    // 0: 微观 — 晶格细水气微响
    this.#attachFilteredNoise('bandpass', 1350, 1.5, 0.28, stages[0], 0.16);
    this.#attachSoftPad(523.25, 0.015, 'sine', stages[0]);

    // 1: 苍穹 — 浩瀚海洋潮汐波浪
    this.#attachFilteredNoise('lowpass', 480, 0.9, 0.68, stages[1], 0.11);
    this.#attachFilteredNoise('bandpass', 920, 0.7, 0.32, stages[1], 0.11);

    // 2: 轨道 — 电离层太空高空扫频气流
    this.#attachFilteredNoise('bandpass', 1200, 3.2, 0.34, stages[2], 0.07);
    this.#attachSoftPad(164.81, 0.035, 'sine', stages[2]);

    // 3: 奇点 — 宏伟引力波深渊嗡鸣（Sub Drone）
    this.#attachFilteredNoise('lowpass', 140, 2.2, 0.85, stages[3], 0.04);
    this.#attachSoftPad(65.41, 0.075, 'triangle', stages[3]); // C2 深空低鸣
    this.#attachSoftPad(98.0, 0.042, 'sine', stages[3]);      // G2
  }

  #attachFilteredNoise(type, freq, q, vol, dest, lfoRate) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = lfoRate;
    lfoGain.gain.value = freq * 0.28;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const g = this.ctx.createGain();
    g.gain.value = vol;

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start();
    lfo.start();
  }

  #attachSoftPad(freq, vol, wave, dest) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 2.4;

    const g = this.ctx.createGain();
    g.gain.value = vol;

    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start();
  }

  #startEventLoop() {
    this.#stopEventLoop();
    this.schedulerTimer = window.setInterval(() => {
      if (!this.enabled || !this.ctx || document.hidden) return;
      const s = this.progress * 3.0;
      const r = Math.random();

      if (this.dimensionId === 'time') {
        if (s < 0.7 && r < 0.45) this.#spawnTone(2200 + Math.random() * 800, 0.024, 0.14, 'sine', 0);
        else if (s >= 0.7 && s < 1.6 && r < 0.48) this.#spawnPluck(587.33, 1, [1, 1.125, 1.333, 1.5, 1.667]);
        else if (s >= 1.6 && s < 2.4 && r < 0.45) this.#spawnSonarPing(2);
        else if (s >= 2.4 && r < 0.48) this.#spawnSparkle(3, [880, 1046.5, 1318.5, 1567.98]);
      } else if (this.dimensionId === 'mood') {
        if (s < 0.7 && r < 0.45) this.#spawnSparkle(0, [783.99, 987.77, 1174.66]);
        else if (s >= 0.7 && s < 1.65 && r < 0.72) this.#spawnHeartbeat(1);
        else if (s >= 1.65 && s < 2.35 && r < 0.55) this.#spawnRainDrop(2);
        else if (s >= 2.35 && r < 0.5) this.#spawnDreamSwell(3);
      } else {
        if (s < 0.7 && r < 0.55) this.#spawnRainDrop(0, 1.4);
        else if (s >= 0.7 && s < 1.6 && r < 0.35) this.#spawnTone(440 + Math.random() * 220, 0.015, 0.4, 'sine', 1);
        else if (s >= 1.6 && s < 2.4 && r < 0.45) this.#spawnSonarPing(2);
        else if (s >= 2.4 && r < 0.45) this.#spawnSparkle(3, [293.66, 440.0, 587.33, 659.25]);
      }
    }, 920);
  }

  #stopEventLoop() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  #getStageDest(stageIdx) {
    const grp = this.dimGroups[this.dimensionId];
    return grp?.stageGains[stageIdx] || this.masterGain;
  }

  #spawnTone(freq, peak, dur, type, stageIdx) {
    const now = this.ctx.currentTime + Math.random() * 0.25;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + dur * 0.5);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  #spawnPluck(baseFreq, stageIdx, ratios) {
    const now = this.ctx.currentTime + Math.random() * 0.2;
    const f = baseFreq * ratios[Math.floor(Math.random() * ratios.length)];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.026, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.95);
  }

  #spawnSonarPing(stageIdx) {
    const now = this.ctx.currentTime + Math.random() * 0.3;
    const freqs = [523.25, 659.25, 783.99];
    const f = freqs[Math.floor(Math.random() * freqs.length)];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.020, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + 1.15);
  }

  #spawnSparkle(stageIdx, notes) {
    const now = this.ctx.currentTime + Math.random() * 0.2;
    const f = notes[Math.floor(Math.random() * notes.length)];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.022, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + 1.4);
  }

  #spawnHeartbeat(stageIdx) {
    const now = this.ctx.currentTime;
    [0, 0.22].forEach((offset, idx) => {
      const t0 = now + offset;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 74 : 62, t0);
      osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(idx === 0 ? 0.08 : 0.05, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(g);
      g.connect(this.#getStageDest(stageIdx));
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
  }

  #spawnRainDrop(stageIdx, pitchScale = 1.0) {
    const now = this.ctx.currentTime + Math.random() * 0.35;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f0 = (720 + Math.random() * 580) * pitchScale;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.55, now + 0.06);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.018, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.09);
  }

  #spawnDreamSwell(stageIdx) {
    const now = this.ctx.currentTime + Math.random() * 0.2;
    const notes = [392.0, 493.88, 587.33, 739.99];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.022, now + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    osc.connect(g);
    g.connect(this.#getStageDest(stageIdx));
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    osc.start(now);
    osc.stop(now + 1.2);
  }

  destroy() {
    this.#stopEventLoop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

  global.SHIKI = global.SHIKI || {};
  global.SHIKI.DimensionalSoundscape = DimensionalSoundscape;
})(window);
