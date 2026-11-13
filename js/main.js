(function (global) {
  'use strict';

  const {
    DIMENSIONS,
    getDimensionById,
    SpringLensPhysics,
    LiquidGlassRenderer,
    DimensionalSoundscape,
  } = global.SHIKI || {};

  const LANG_STORAGE_KEY = 'shiki-lang';

  const I18N = {
    zh: {
      htmlLang: 'zh-CN',
      pageTitle: '隙间琉璃 · SHIKI — 时间 · 情绪 · 空间',
      brandName: 'SHIKI · 隙间琉璃',
      langBtnLabel: 'EN',
      langBtnAria: '切换为英文界面 (Switch to English)',
      langBtnTitle: 'Switch to English',
      zenEnter: '纯净鉴赏',
      zenExit: '退出纯净',
      zenAria: '切换纯净鉴赏模式（快捷键 Z）',
      zenTitle: '纯净鉴赏模式 (Z)',
      themeLight: '晴昼',
      themeDark: '夜幕',
      themeAria: '切换浅色或深色画廊氛围',
      dimSwitcherAria: '变换维度切换',
      showcaseAria: '隙间琉璃液态玻璃交互画框',
      sliderLabel: '滑动调节当前维度四阶流转进度',
      ticksAria: '四阶节点快速定位',
      dockAria: '体验控制栏',
      modeGroupAria: '光学透镜模式',
      tourIdle: '自动巡游',
      tourRunning: '暂停巡游',
      audioOff: '开启声景',
      audioOn: '声景开启',
      opticsBtn: '光学微调',
      opticsDialogAria: '液态玻璃光学与物理参数',
      opticsTitle: '琉璃光学与物理',
      opticsReset: '还原默认',
      optRefraction: '屈光强度 (Refraction)',
      optDispersion: '边缘色散 (Dispersion)',
      optMagnify: '透镜放大 (Zoom)',
      optParticles: '氛围微粒 (Atmosphere)',
      optElasticity: '弹性敏感度 (Elasticity)',
      footerNote: 'WebGL2 实时折射 · 弹簧流体 · 多维声景',
    },
    en: {
      htmlLang: 'en',
      pageTitle: 'SHIKI · Liquid Glass — Time · Mood · Space',
      brandName: 'SHIKI · Liquid Glass',
      langBtnLabel: '中文',
      langBtnAria: '切换为中文界面 (Switch to Chinese)',
      langBtnTitle: '切换为中文',
      zenEnter: 'Zen',
      zenExit: 'Exit Zen',
      zenAria: 'Toggle Zen mode (Shortcut Z)',
      zenTitle: 'Zen Mode (Z)',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeAria: 'Toggle light or dark gallery theme',
      dimSwitcherAria: 'Dimension switcher',
      showcaseAria: 'SHIKI liquid glass interactive showcase',
      sliderLabel: 'Scrub across the four stages of the active dimension',
      ticksAria: 'Stage quick navigation',
      dockAria: 'Experience controls',
      modeGroupAria: 'Optical lens mode',
      tourIdle: 'Auto Tour',
      tourRunning: 'Pause',
      audioOff: 'Soundscape',
      audioOn: 'Sound On',
      opticsBtn: 'Optics',
      opticsDialogAria: 'Liquid glass optics and physics controls',
      opticsTitle: 'Optics & Physics',
      opticsReset: 'Reset',
      optRefraction: 'Refraction',
      optDispersion: 'Dispersion',
      optMagnify: 'Magnify',
      optParticles: 'Atmosphere',
      optElasticity: 'Elasticity',
      footerNote: 'WebGL2 Refraction · Spring Physics · Soundscape',
    },
  };

  const DEFAULT_OPTICS = {
    refraction: 1.0,
    dispersion: 1.0,
    magnify: 1.08,
    particles: 1.0,
    elasticity: 1.0,
  };

  const DIM_SHORTCUTS = {
    1: 'time',
    2: 'mood',
    3: 'space',
  };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpRgb(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function isTextEditableTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return !['range', 'button', 'checkbox', 'radio', 'submit', 'reset'].includes(type);
    }
    return false;
  }

  function loadSavedLang() {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === 'en' || saved === 'zh' ? saved : 'zh';
    } catch (_) {
      return 'zh';
    }
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (_) {}
  }

  function initApp() {
    const canvas = document.getElementById('lens-canvas');
    const stageWrapper = document.getElementById('lens-stage-wrapper');
    const slider = document.getElementById('season-slider');
    const sliderHint = document.getElementById('slider-hint');
    const heroTitle = document.getElementById('hero-title');
    const stageBadge = document.getElementById('stage-badge');
    const stageVerse = document.getElementById('stage-verse');
    const portalPill = document.getElementById('portal-pill');
    const themeMeta = document.querySelector('meta[name="color-scheme"]');

    const brandNameEl = document.getElementById('brand-name') || document.querySelector('.brand-name');
    const dimSwitcher = document.querySelector('.dimension-switcher');
    const capsuleShowcase = document.querySelector('.capsule-showcase');
    const sliderLabelEl = document.getElementById('slider-aria-label') || document.querySelector('label[for="season-slider"]');
    const stageTicksNav = document.querySelector('.stage-ticks');
    const controlDock = document.querySelector('.control-dock');
    const segmentedControl = document.querySelector('.segmented-control');
    const footerNoteEl = document.getElementById('footer-note') || document.querySelector('.footer-note');

    const dimButtons = Array.from(document.querySelectorAll('.dim-btn'));
    const tickButtons = Array.from(document.querySelectorAll('.tick-btn'));

    const modeRefractBtn = document.getElementById('mode-refract');
    const modeRefractLabel = document.getElementById('mode-refract-label');
    const modePortalBtn = document.getElementById('mode-portal');
    const modePortalLabel = document.getElementById('mode-portal-label');

    const tourBtn = document.getElementById('tour-toggle');
    const tourLabel = document.getElementById('tour-label');
    const audioBtn = document.getElementById('audio-toggle');
    const audioLabel = document.getElementById('audio-label');
    const opticsBtnLabel = document.getElementById('optics-label') || document.querySelector('#optics-btn > span');
    const themeBtn = document.getElementById('theme-toggle');
    const themeLabel = document.getElementById('theme-label');
    const zenBtn = document.getElementById('zen-toggle');
    const zenLabel = document.getElementById('zen-label');
    const langBtn = document.getElementById('lang-toggle');
    const langLabel = document.getElementById('lang-label');
    const opticsPopover = document.getElementById('optics-popover');
    const opticsTitleEl = document.getElementById('optics-title') || document.querySelector('.popover-title');

    const optRefract = document.getElementById('opt-refraction');
    const optDisp = document.getElementById('opt-dispersion');
    const optMag = document.getElementById('opt-magnify');
    const optParticles = document.getElementById('opt-particles');
    const optElasticity = document.getElementById('opt-elasticity');
    const valRefract = document.getElementById('val-refraction');
    const valDisp = document.getElementById('val-dispersion');
    const valMag = document.getElementById('val-magnify');
    const valParticles = document.getElementById('val-particles');
    const valElasticity = document.getElementById('val-elasticity');
    const resetOpticsBtn = document.getElementById('reset-optics');

    const optRefractLabel = document.getElementById('label-refraction') || document.querySelector('label[for="opt-refraction"]');
    const optDispLabel = document.getElementById('label-dispersion') || document.querySelector('label[for="opt-dispersion"]');
    const optMagLabel = document.getElementById('label-magnify') || document.querySelector('label[for="opt-magnify"]');
    const optParticlesLabel = document.getElementById('label-particles') || document.querySelector('label[for="opt-particles"]');
    const optElasticityLabel = document.getElementById('label-elasticity') || document.querySelector('label[for="opt-elasticity"]');

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const soundscape = new DimensionalSoundscape();

    let rafId = 0;
    let lastFrameTime = performance.now();
    let renderer = null;

    const physics = new SpringLensPhysics(0, {
      onBoundaryImpact: (side, intensity) => {
        if (renderer && !motionQuery.matches) {
          const m = renderer.getMetrics();
          const u = side === 0 ? m.uStart : m.uEnd;
          renderer.triggerRipple?.(u, 0.5, intensity);
        }
        if (typeof soundscape.playImpactResonance === 'function') {
          soundscape.playImpactResonance(intensity);
        }
        requestRender();
      },
    });

    renderer = new LiquidGlassRenderer(canvas, {
      onLoadProgress: () => {
        requestRender();
      },
    });

    let currentLang = loadSavedLang();
    let currentDimension = DIMENSIONS[0];
    let isTouring = false;
    let tourDirection = 1;
    let tourProgress = 0;
    let isZen = false;
    let hasInteracted = false;

    let lastStageIdx = -1;
    let lastPortalKey = '';
    let lastValuetext = '';
    const textAnimMap = new WeakMap();

    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    let activePointerId = null;
    let grabOffset = 0;
    let dragSamples = [];
    let lastDragRippleTime = 0;
    let lastDragRippleU = -1;

    // =========================================================================
    // 按需唤醒渲染调度（静止且无活跃波纹/粒子时自动休眠，绝不后台空跑）
    // =========================================================================
    function requestRender() {
      if (document.hidden) return;
      if (!rafId) {
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    }

    // =========================================================================
    // 主题检测与同步
    // =========================================================================
    function isDarkActive() {
      const manual = document.documentElement.dataset.theme;
      if (manual === 'dark') return true;
      if (manual === 'light') return false;
      return darkQuery.matches;
    }

    function applyThemePreference(theme) {
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.dataset.theme = theme;
        if (themeMeta) themeMeta.setAttribute('content', theme);
      } else {
        delete document.documentElement.dataset.theme;
        if (themeMeta) themeMeta.setAttribute('content', 'light dark');
      }
    }

    function syncThemeUI() {
      const dark = isDarkActive();
      const t = I18N[currentLang];
      if (themeLabel) {
        themeLabel.textContent = dark ? t.themeLight : t.themeDark;
      }
      const bgStr = getComputedStyle(document.body).backgroundColor;
      renderer.setThemeColor(bgStr || (dark ? '#0f1116' : '#f6f5f1'), dark);
      updateAtmosphere(physics.position, true);
      requestRender();
    }

    themeBtn?.addEventListener('click', () => {
      const nextTheme = isDarkActive() ? 'light' : 'dark';
      const systemTheme = darkQuery.matches ? 'dark' : 'light';

      if (nextTheme === systemTheme) {
        applyThemePreference(null);
        try {
          localStorage.removeItem('shiki-theme');
        } catch (_) {}
      } else {
        applyThemePreference(nextTheme);
        try {
          localStorage.setItem('shiki-theme', nextTheme);
        } catch (_) {}
      }
      requestAnimationFrame(syncThemeUI);
    });

    darkQuery.addEventListener('change', () => {
      if (!document.documentElement.dataset.theme) {
        requestAnimationFrame(syncThemeUI);
      }
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'shiki-theme') {
        applyThemePreference(e.newValue);
        requestAnimationFrame(syncThemeUI);
      } else if (e.key === LANG_STORAGE_KEY) {
        const nextLang = e.newValue === 'en' ? 'en' : 'zh';
        if (nextLang !== currentLang) {
          currentLang = nextLang;
          applyLanguageUI({ initial: true });
        }
      }
    });

    // =========================================================================
    // 中英双语切换与局部文本同步
    // =========================================================================
    function syncDimensionCopy(shouldAnimate) {
      const isEn = currentLang === 'en';
      const dim = currentDimension;

      updateTextSmoothly(heroTitle, isEn ? dim.titleEn : dim.title, shouldAnimate);
      if (sliderHint) {
        sliderHint.textContent = isEn ? dim.hintEn : dim.hint;
      }
      if (modeRefractLabel) {
        modeRefractLabel.textContent = isEn ? dim.modes.refract.labelEn : dim.modes.refract.label;
      }
      if (modePortalLabel) {
        modePortalLabel.textContent = isEn ? dim.modes.portal.labelEn : dim.modes.portal.label;
      }

      tickButtons.forEach((btn, i) => {
        const stageIdx = Number(btn.dataset.stage ?? btn.dataset.season ?? i);
        const stage = dim.stages[stageIdx];
        if (!stage) return;
        const cnEl = btn.querySelector('.tick-cn');
        const enEl = btn.querySelector('.tick-en');
        if (cnEl) cnEl.textContent = stage.shortCn;
        if (enEl) enEl.textContent = stage.shortEn;
      });
    }

    function applyLanguageUI({ initial = false } = {}) {
      const t = I18N[currentLang];
      const isEn = currentLang === 'en';

      document.documentElement.lang = t.htmlLang;
      document.title = t.pageTitle;
      if (brandNameEl) brandNameEl.textContent = t.brandName;

      if (langLabel) langLabel.textContent = t.langBtnLabel;
      if (langBtn) {
        langBtn.setAttribute('aria-label', t.langBtnAria);
        langBtn.setAttribute('title', t.langBtnTitle);
      }

      if (zenLabel) zenLabel.textContent = isZen ? t.zenExit : t.zenEnter;
      if (zenBtn) {
        zenBtn.setAttribute('aria-label', t.zenAria);
        zenBtn.setAttribute('title', t.zenTitle);
      }

      if (themeLabel) themeLabel.textContent = isDarkActive() ? t.themeLight : t.themeDark;
      if (themeBtn) themeBtn.setAttribute('aria-label', t.themeAria);

      if (dimSwitcher) dimSwitcher.setAttribute('aria-label', t.dimSwitcherAria);
      dimButtons.forEach((btn) => {
        const dim = getDimensionById(btn.dataset.dim);
        const labelEl = btn.querySelector('.dim-label');
        if (labelEl) {
          labelEl.textContent = isEn ? dim.labelEn : dim.label;
        }
      });

      if (capsuleShowcase) capsuleShowcase.setAttribute('aria-label', t.showcaseAria);
      if (sliderLabelEl) sliderLabelEl.textContent = t.sliderLabel;
      if (stageTicksNav) stageTicksNav.setAttribute('aria-label', t.ticksAria);
      if (controlDock) controlDock.setAttribute('aria-label', t.dockAria);
      if (segmentedControl) segmentedControl.setAttribute('aria-label', t.modeGroupAria);

      if (tourLabel) tourLabel.textContent = isTouring ? t.tourRunning : t.tourIdle;
      if (audioLabel) audioLabel.textContent = soundscape.enabled ? t.audioOn : t.audioOff;
      if (opticsBtnLabel) opticsBtnLabel.textContent = t.opticsBtn;

      if (opticsPopover) opticsPopover.setAttribute('aria-label', t.opticsDialogAria);
      if (opticsTitleEl) opticsTitleEl.textContent = t.opticsTitle;
      if (resetOpticsBtn) resetOpticsBtn.textContent = t.opticsReset;
      if (optRefractLabel) optRefractLabel.textContent = t.optRefraction;
      if (optDispLabel) optDispLabel.textContent = t.optDispersion;
      if (optMagLabel) optMagLabel.textContent = t.optMagnify;
      if (optParticlesLabel) optParticlesLabel.textContent = t.optParticles;
      if (optElasticityLabel) optElasticityLabel.textContent = t.optElasticity;
      if (footerNoteEl) footerNoteEl.textContent = t.footerNote;

      syncDimensionCopy(!initial);
      lastPortalKey = '';
      lastValuetext = '';
      updateAtmosphere(physics.position, true);
    }

    function setLanguage(lang) {
      const nextLang = lang === 'en' ? 'en' : 'zh';
      if (nextLang === currentLang) return;
      currentLang = nextLang;
      saveLang(nextLang);
      applyLanguageUI({ initial: false });
    }

    langBtn?.addEventListener('click', () => {
      setLanguage(currentLang === 'zh' ? 'en' : 'zh');
    });

    // =========================================================================
    // 文韵平滑过渡、窥镜同步指示与三维度环境光晕更新
    // =========================================================================
    function updateTextSmoothly(el, nextText, shouldAnimate) {
      if (!el || el.textContent === nextText) return;
      const prevAnim = textAnimMap.get(el);
      if (prevAnim) {
        prevAnim.cancel();
        textAnimMap.delete(el);
      }
      el.textContent = nextText;
      if (!shouldAnimate || motionQuery.matches || typeof el.animate !== 'function') {
        return;
      }
      const anim = el.animate(
        [
          { opacity: 0.42, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
      textAnimMap.set(el, anim);
    }

    function updatePortalPillContent(dim, portalStage, isPortal, shouldAnimate) {
      if (!portalPill) return;
      const wasHidden = portalPill.hidden;
      portalPill.hidden = !isPortal;
      if (!isPortal) {
        lastPortalKey = '';
        return;
      }

      const isEn = currentLang === 'en';
      const prefixText = isEn ? dim.modes.portal.previewPrefixEn : dim.modes.portal.previewPrefix;
      const stageText = isEn ? portalStage.badgeEn : portalStage.badge;
      const portalKey = `${currentLang}:${dim.id}:${stageText}`;
      if (portalKey === lastPortalKey) return;
      lastPortalKey = portalKey;

      const prefixEl = portalPill.querySelector('#portal-prefix, .portal-prefix');
      const nameEl = portalPill.querySelector('#portal-name, .portal-name, .portal-preview-name, strong');

      if (prefixEl && nameEl) {
        prefixEl.textContent = prefixText;
        updateTextSmoothly(nameEl, stageText, !wasHidden && shouldAnimate);
      } else {
        updateTextSmoothly(portalPill, `${prefixText} · ${stageText}`, !wasHidden && shouldAnimate);
      }
    }

    function updateAtmosphere(progress, forceStageRefresh = false) {
      const clamped = clamp01(progress);
      const s = clamped * 3.0;
      const idxA = Math.min(3, Math.floor(s));
      const idxB = Math.min(3, idxA + 1);
      const frac = s - idxA;

      const stages = currentDimension.stages;
      const secA = stages[idxA];
      const secB = stages[idxB];
      const dark = isDarkActive();
      const isEn = currentLang === 'en';

      const gA = lerpRgb(secA.glowA, secB.glowA, frac);
      const gB = lerpRgb(secA.glowB, secB.glowB, frac);
      const acc = lerpRgb(
        dark ? secA.accentDark : secA.accentLight,
        dark ? secB.accentDark : secB.accentLight,
        frac
      );

      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--season-glow-a', `rgb(${gA[0]} ${gA[1]} ${gA[2]})`);
      rootStyle.setProperty('--season-glow-b', `rgb(${gB[0]} ${gB[1]} ${gB[2]})`);
      rootStyle.setProperty('--season-accent', `rgb(${acc[0]} ${acc[1]} ${acc[2]})`);

      const nearest = Math.round(s);
      const isInitialText = lastStageIdx === -1;
      if (forceStageRefresh || nearest !== lastStageIdx) {
        lastStageIdx = nearest;
        const cur = stages[nearest];
        updateTextSmoothly(stageBadge, isEn ? cur.badgeEn : cur.badge, !isInitialText);
        updateTextSmoothly(stageVerse, isEn ? cur.verseEn : cur.verse, !isInitialText);
        tickButtons.forEach((btn, i) => {
          const btnStage = Number(btn.dataset.stage ?? btn.dataset.season ?? i);
          const active = btnStage === nearest;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-current', active ? 'true' : 'false');
        });
      }

      const isPortal = renderer.state.mode > 0.5;
      const portalIdx = (nearest + 1) % 4;
      const portalStage = stages[portalIdx];
      updatePortalPillContent(currentDimension, portalStage, isPortal, !isInitialText);

      if (slider) {
        const pct = Math.round(clamped * 100);
        const nearestStage = stages[nearest];
        const dimName = isEn ? currentDimension.labelEn : currentDimension.label;
        const stageName = isEn ? nearestStage.badgeEn : nearestStage.badge;
        const portalPrefix = isEn
          ? currentDimension.modes.portal.previewPrefixEn
          : currentDimension.modes.portal.previewPrefix;
        const portalStageName = isEn ? portalStage.badgeEn : portalStage.badge;
        const portalSuffix = isPortal
          ? isEn
            ? ` · ${portalPrefix}: ${portalStageName}`
            : ` · ${portalPrefix}：${portalStageName}`
          : '';
        const nextValuetext = `${dimName} · ${stageName} (${pct}%)${portalSuffix}`;
        if (nextValuetext !== lastValuetext) {
          lastValuetext = nextValuetext;
          slider.setAttribute('aria-valuetext', nextValuetext);
        }
      }

      soundscape.updateProgress(clamped);
    }

    // =========================================================================
    // 维度切换与纯净模式（Zen Mode）
    // =========================================================================
    function setDimension(dimId, { initial = false } = {}) {
      const nextDim = getDimensionById(dimId);
      if (!initial && nextDim.id === currentDimension.id) return;

      currentDimension = nextDim;
      document.body.dataset.dimension = nextDim.id;

      dimButtons.forEach((btn) => {
        const active = btn.dataset.dim === nextDim.id;
        btn.setAttribute('aria-pressed', String(active));
        btn.classList.toggle('is-selected', active);
        btn.classList.toggle('is-active', active);
      });

      syncDimensionCopy(!initial);

      physics.setDimension(nextDim.id);
      soundscape.setDimension(nextDim.id);
      renderer.state.dimension = nextDim.id;
      renderer.setDimension?.(nextDim.id);

      lastPortalKey = '';
      updateAtmosphere(physics.position, true);
      requestRender();
    }

    dimButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dimId = btn.dataset.dim;
        if (!dimId) return;
        setDimension(dimId);
      });
    });

    function setZenMode(enabled) {
      isZen = Boolean(enabled);
      document.body.classList.toggle('is-zen', isZen);
      if (zenBtn) {
        zenBtn.setAttribute('aria-pressed', String(isZen));
        zenBtn.classList.toggle('is-active', isZen);
        zenBtn.classList.toggle('is-running', isZen);
      }
      if (zenLabel) {
        const t = I18N[currentLang];
        zenLabel.textContent = isZen ? t.zenExit : t.zenEnter;
      }
      if (isZen && opticsPopover && opticsPopover.matches?.(':popover-open')) {
        try {
          opticsPopover.hidePopover();
        } catch (_) {}
      }
    }

    zenBtn?.addEventListener('click', () => {
      setZenMode(!isZen);
    });

    // =========================================================================
    // 交互标记、巡游控制与坐标映射
    // =========================================================================
    function markInteracted() {
      if (!hasInteracted) {
        hasInteracted = true;
        stageWrapper?.classList.add('has-interacted');
      }
    }

    function stopTour() {
      if (!isTouring) return;
      isTouring = false;
      tourBtn?.classList.remove('is-running');
      if (tourLabel) tourLabel.textContent = I18N[currentLang].tourIdle;
    }

    function setSliderFromProgress(p) {
      if (slider) {
        slider.value = String(Math.round(clamp01(p) * 1000));
      }
    }

    function pointerXToProgressRaw(clientX) {
      const rect = stageWrapper.getBoundingClientRect();
      if (rect.width <= 0) return physics.target;
      const u = (clientX - rect.left) / rect.width;
      const m = renderer.getMetrics();
      const span = Math.max(0.01, m.uEnd - m.uStart);
      return (u - m.uStart) / span;
    }

    function pointerXToProgress(clientX) {
      return clamp01(pointerXToProgressRaw(clientX));
    }

    function clientPointToUV(clientX, clientY) {
      const rect = stageWrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { u: 0.5, v: 0.5 };
      const u = clamp01((clientX - rect.left) / rect.width);
      const v = clamp01(1 - (clientY - rect.top) / rect.height);
      return { u, v };
    }

    function emitStageRipple(clientX, clientY, intensity, force = false) {
      if (motionQuery.matches || !renderer.triggerRipple) return;
      const now = performance.now();
      const { u, v } = clientPointToUV(clientX, clientY);
      if (!force && (now - lastDragRippleTime < 160 || Math.abs(u - lastDragRippleU) < 0.045)) {
        return;
      }
      lastDragRippleTime = now;
      lastDragRippleU = u;
      renderer.triggerRipple(u, v, intensity);
    }

    // =========================================================================
    // 原生滑块、零跳变抓起拖拽、惯性抛掷（Flick）与全键盘导航
    // =========================================================================
    slider?.addEventListener('input', () => {
      markInteracted();
      stopTour();
      const val = Number(slider.value) / 1000;
      physics.setTarget(val, motionQuery.matches);
      requestRender();
    });

    slider?.addEventListener('keydown', (e) => {
      stageWrapper?.removeAttribute('data-pointer-focus');
      let next = null;
      const cur = physics.target;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        next = e.shiftKey ? Math.min(1, (Math.floor(cur * 3 + 0.02) + 1) / 3) : clamp01(cur + 0.04);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        next = e.shiftKey ? Math.max(0, (Math.ceil(cur * 3 - 0.02) - 1) / 3) : clamp01(cur - 0.04);
      } else if (e.key === 'PageUp') {
        next = clamp01(cur + 0.16);
      } else if (e.key === 'PageDown') {
        next = clamp01(cur - 0.16);
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = 1;
      }

      if (next !== null) {
        e.preventDefault();
        markInteracted();
        stopTour();
        physics.setTarget(next, motionQuery.matches);
        setSliderFromProgress(next);
        requestRender();
      }
    });

    slider?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      stageWrapper?.setAttribute('data-pointer-focus', 'true');
      slider.focus({ preventScroll: true });

      markInteracted();
      stopTour();
      activePointerId = e.pointerId;
      try {
        slider.setPointerCapture(e.pointerId);
      } catch (_) {}

      const rawP = pointerXToProgressRaw(e.clientX);
      const pointerP = clamp01(rawP);
      const m = renderer.getMetrics();
      const travelRatioSpan = Math.max(0.01, m.uEnd - m.uStart);
      const lensHalfProgress = (m.lensHalfU / travelRatioSpan) * 1.15;

      if (Math.abs(pointerP - physics.position) <= lensHalfProgress) {
        grabOffset = physics.position - pointerP;
      } else {
        grabOffset = 0;
        physics.setTarget(pointerP, motionQuery.matches);
        setSliderFromProgress(pointerP);
      }

      dragSamples = [{ t: performance.now(), p: rawP }];
      emitStageRipple(e.clientX, e.clientY, 0.55, true);

      physics.setPressed(true);
      stageWrapper?.classList.add('is-dragging');
      requestRender();
    });

    slider?.addEventListener('pointermove', (e) => {
      if (activePointerId !== e.pointerId) return;
      const now = performance.now();
      const rawP = pointerXToProgressRaw(e.clientX);
      const pointerP = clamp01(rawP);
      const next = clamp01(pointerP + grabOffset);

      dragSamples.push({ t: now, p: rawP });
      const cutoff = now - 110;
      while (dragSamples.length > 2 && dragSamples[0].t < cutoff) {
        dragSamples.shift();
      }

      physics.setTarget(next, motionQuery.matches);
      setSliderFromProgress(next);
      emitStageRipple(e.clientX, e.clientY, 0.28, false);
      requestRender();
    });

    function endPointerDrag(e, applyMomentum = true) {
      if (activePointerId === null) return;
      if (e && e.pointerId !== activePointerId) return;

      try {
        if (slider?.hasPointerCapture(activePointerId)) {
          slider.releasePointerCapture(activePointerId);
        }
      } catch (_) {}

      if (applyMomentum && dragSamples.length >= 2) {
        const now = performance.now();
        const recent = dragSamples.filter((s) => now - s.t <= 110);
        if (recent.length >= 2 && now - recent[recent.length - 1].t < 80) {
          const first = recent[0];
          const last = recent[recent.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0.005) {
            const normVel = (last.p - first.p) / dt;
            const nextTarget = physics.releaseWithVelocity(normVel, motionQuery.matches);
            setSliderFromProgress(nextTarget);
          }
        }
      }

      activePointerId = null;
      grabOffset = 0;
      dragSamples = [];
      physics.setPressed(false);
      stageWrapper?.classList.remove('is-dragging');
      requestRender();
    }

    slider?.addEventListener('blur', () => {
      stageWrapper?.removeAttribute('data-pointer-focus');
    });

    window.addEventListener('pointerup', (e) => endPointerDrag(e, true));
    window.addEventListener('pointercancel', (e) => endPointerDrag(e, false));

    // 触控板水平滑动微调
    stageWrapper?.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 1) {
          e.preventDefault();
          markInteracted();
          stopTour();
          const next = clamp01(physics.target + e.deltaX * 0.0012);
          physics.setTarget(next, motionQuery.matches);
          setSliderFromProgress(next);
          requestRender();
        }
      },
      { passive: false }
    );

    // 悬停微景深视差与玻璃胶囊悬停微浮
    stageWrapper?.addEventListener('pointermove', (e) => {
      if (motionQuery.matches) {
        physics.setHovered(false);
        return;
      }
      const rect = stageWrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetParallaxX = Math.max(-1, Math.min(1, nx));
      targetParallaxY = Math.max(-1, Math.min(1, -ny));

      const pointerP = pointerXToProgress(e.clientX);
      const m = renderer.getMetrics();
      const travelRatioSpan = Math.max(0.01, m.uEnd - m.uStart);
      const lensHalfProgress = (m.lensHalfU / travelRatioSpan) * 1.15;
      physics.setHovered(Math.abs(pointerP - physics.position) <= lensHalfProgress);
      requestRender();
    });

    stageWrapper?.addEventListener('pointerleave', () => {
      targetParallaxX = 0;
      targetParallaxY = 0;
      physics.setHovered(false);
      requestRender();
    });

    // 四阶快捷锚点刻度点击
    tickButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        markInteracted();
        stopTour();
        const targetP = Number(btn.dataset.progress ?? idx / 3);
        const stageIdx = Number(btn.dataset.stage ?? btn.dataset.season ?? idx);
        physics.setTarget(targetP, motionQuery.matches);
        setSliderFromProgress(targetP);
        if (soundscape.enabled) {
          soundscape.playGlassChime(stageIdx);
        }
        requestRender();
      });
    });

    // 全局快捷键：Z 切换纯净模式，1/2/3 快速切换维度
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEditableTarget(document.activeElement)) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setZenMode(!isZen);
      } else if (DIM_SHORTCUTS[e.key]) {
        e.preventDefault();
        setDimension(DIM_SHORTCUTS[e.key]);
      }
    });

    // =========================================================================
    // 透镜模式、自动巡游与多维声景控制
    // =========================================================================
    function setLensMode(mode) {
      const isPortal = mode === 'portal';
      renderer.state.mode = isPortal ? 1.0 : 0.0;
      modeRefractBtn?.classList.toggle('is-selected', !isPortal);
      modePortalBtn?.classList.toggle('is-selected', isPortal);
      modeRefractBtn?.setAttribute('aria-pressed', String(!isPortal));
      modePortalBtn?.setAttribute('aria-pressed', String(isPortal));
      updateAtmosphere(physics.position);
      requestRender();
    }

    modeRefractBtn?.addEventListener('click', () => setLensMode('refract'));
    modePortalBtn?.addEventListener('click', () => setLensMode('portal'));

    tourBtn?.addEventListener('click', () => {
      markInteracted();
      isTouring = !isTouring;
      const t = I18N[currentLang];
      if (isTouring) {
        tourProgress = physics.position;
        tourDirection = tourProgress >= 0.98 ? -1 : 1;
        tourBtn.classList.add('is-running');
        if (tourLabel) tourLabel.textContent = t.tourRunning;
        requestRender();
      } else {
        tourBtn.classList.remove('is-running');
        if (tourLabel) tourLabel.textContent = t.tourIdle;
      }
    });

    audioBtn?.addEventListener('click', async () => {
      const active = await soundscape.toggle();
      const t = I18N[currentLang];
      audioBtn.classList.toggle('is-audio-active', active);
      audioBtn.classList.toggle('is-running', active);
      if (audioLabel) audioLabel.textContent = active ? t.audioOn : t.audioOff;
    });

    // =========================================================================
    // 光学与弹性调节 Popover
    // =========================================================================
    function syncMiniSlider(inputEl, outputEl, formatter) {
      if (!inputEl) return;
      const min = Number(inputEl.min || 0);
      const max = Number(inputEl.max || 100);
      const val = Number(inputEl.value);
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      inputEl.style.setProperty('--slider-progress', `${pct.toFixed(2)}%`);
      if (outputEl) {
        outputEl.textContent = formatter(val);
      }
    }

    function applyOptics() {
      const r = Number(optRefract?.value ?? DEFAULT_OPTICS.refraction);
      const d = Number(optDisp?.value ?? DEFAULT_OPTICS.dispersion);
      const m = Number(optMag?.value ?? DEFAULT_OPTICS.magnify);
      const p = Number(optParticles?.value ?? DEFAULT_OPTICS.particles);
      const el = Number(optElasticity?.value ?? DEFAULT_OPTICS.elasticity);

      renderer.state.refraction = r;
      renderer.state.dispersion = d;
      renderer.state.magnify = m;
      renderer.state.particles = motionQuery.matches ? 0 : p;
      physics.setElasticity(el);

      if (motionQuery.matches) {
        physics.setHovered(false);
      }

      syncMiniSlider(optRefract, valRefract, (v) => v.toFixed(2));
      syncMiniSlider(optDisp, valDisp, (v) => v.toFixed(2));
      syncMiniSlider(optMag, valMag, (v) => `${v.toFixed(2)}x`);
      syncMiniSlider(optParticles, valParticles, (v) => `${Math.round(v * 100)}%`);
      syncMiniSlider(optElasticity, valElasticity, (v) => v.toFixed(2));
      requestRender();
    }

    [optRefract, optDisp, optMag, optParticles, optElasticity].forEach((el) => {
      el?.addEventListener('input', applyOptics);
    });

    resetOpticsBtn?.addEventListener('click', () => {
      if (optRefract) optRefract.value = String(DEFAULT_OPTICS.refraction);
      if (optDisp) optDisp.value = String(DEFAULT_OPTICS.dispersion);
      if (optMag) optMag.value = String(DEFAULT_OPTICS.magnify);
      if (optParticles) optParticles.value = String(DEFAULT_OPTICS.particles);
      if (optElasticity) optElasticity.value = String(DEFAULT_OPTICS.elasticity);
      applyOptics();
    });

    // =========================================================================
    // 按需节能主渲染循环与视口适配
    // =========================================================================
    if (stageWrapper) {
      const resizeObserver = new ResizeObserver(() => {
        renderer.resize();
        if (!document.hidden) {
          renderer.render(performance.now());
        }
      });
      resizeObserver.observe(stageWrapper);
    }

    function frame(now) {
      rafId = 0;
      const dt = Math.max(0.001, (now - lastFrameTime) * 0.001);
      lastFrameTime = now;

      const reduced = motionQuery.matches;

      if (isTouring) {
        const speed = reduced ? 0.045 : 0.085;
        tourProgress += tourDirection * speed * dt;
        if (tourProgress >= 1) {
          tourProgress = 1;
          tourDirection = -1;
        } else if (tourProgress <= 0) {
          tourProgress = 0;
          tourDirection = 1;
        }
        physics.setTarget(tourProgress, reduced);
        setSliderFromProgress(tourProgress);
      }

      const physicsActive = physics.step(dt, reduced);

      const dpX = targetParallaxX - currentParallaxX;
      const dpY = targetParallaxY - currentParallaxY;
      const parallaxActive = !reduced && (Math.abs(dpX) > 0.001 || Math.abs(dpY) > 0.001);
      if (reduced) {
        currentParallaxX = 0;
        currentParallaxY = 0;
      } else if (parallaxActive) {
        currentParallaxX += dpX * Math.min(1, dt * 8);
        currentParallaxY += dpY * Math.min(1, dt * 8);
      } else {
        currentParallaxX = targetParallaxX;
        currentParallaxY = targetParallaxY;
      }

      renderer.state.dimension = currentDimension.id;
      renderer.state.progress = physics.position;
      renderer.state.squash = physics.squash;
      renderer.state.tilt = physics.tilt;
      renderer.state.hover = physics.hover;
      renderer.state.press = physics.press;
      renderer.state.parallaxX = currentParallaxX;
      renderer.state.parallaxY = currentParallaxY;
      if (reduced) {
        renderer.state.particles = 0;
      }

      updateAtmosphere(physics.position);
      renderer.render(now);

      const rendererHasActive =
        typeof renderer.hasActiveAnimation === 'function'
          ? renderer.hasActiveAnimation(now)
          : renderer.state.particles > 0.01;

      const needsContinuousLoop =
        isTouring ||
        physicsActive ||
        parallaxActive ||
        (!reduced && rendererHasActive);

      if (needsContinuousLoop && !document.hidden) {
        rafId = requestAnimationFrame(frame);
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        requestRender();
      }
    });

    motionQuery.addEventListener('change', applyOptics);

    // 初始化默认维度、光学参数、双语界面、主题及首帧渲染
    applyOptics();
    setDimension(DIMENSIONS[0].id, { initial: true });
    applyLanguageUI({ initial: true });
    syncThemeUI();
    renderer.resize();
    requestRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
  } else {
    initApp();
  }
})(window);
