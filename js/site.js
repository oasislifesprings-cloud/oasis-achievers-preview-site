/* Oasis Achievers. Plain JavaScript, no dependencies, no network requests except the hero slide list (a static file). */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const html = document.documentElement;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const wideMQ = matchMedia('(min-width: 900px)');
  const reduced = () => reduceMQ.matches;
  const EASE = 'cubic-bezier(0.22, 0.8, 0.2, 1)';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  html.classList.add('js');

  /* ---------------------------------------------------------------
     Sheets: sections stack like pages. Their scroll positions are the
     sum of the heights before them, because a stuck section reports a
     shifted offset.
  --------------------------------------------------------------- */
  const sheets = $$('.sheet');
  const sheetTop = (el) => {
    let top = 0;
    for (const s of sheets) { if (s === el) break; top += s.offsetHeight; }
    return top;
  };
  const view = { hero: true, offer: false, connect: false };
  const updateSheets = () => {
    const vh = window.innerHeight;
    const y = window.scrollY;
    let top = 0;
    for (const s of sheets) {
      const h = s.offsetHeight;
      s.style.setProperty('--stick', Math.min(0, vh - h) + 'px');
      const on = y + vh > top + 1 && y < top + h - 1;
      if (s.id === 'top') view.hero = on;
      if (s.id === 'offer') view.offer = on;
      if (s.id === 'connect') view.connect = y + vh > top + vh * 0.35;
      top += h;
    }
  };

  /* Page scroll lock for full-screen dialogs. */
  let locks = 0;
  const lock = (on) => {
    locks = Math.max(0, locks + (on ? 1 : -1));
    html.classList.toggle('is-locked', locks > 0);
  };

  /* ---------------------------------------------------------------
     Fit the giant words. Each word's width in em is measured from the
     real font, so a font swap (Blacker Sans Pro) needs no CSS change.
  --------------------------------------------------------------- */
  const measureEm = (text) => {
    const probe = document.createElement('span');
    probe.className = 'display';
    probe.textContent = text;
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-size:200px;';
    document.body.append(probe);
    const w = probe.getBoundingClientRect().width / 200;
    probe.remove();
    return w;
  };
  const fitWords = () => {
    const hero = $('.hero');
    if (hero) hero.style.setProperty('--w', measureEm('achievers').toFixed(3));
    let max = 0;
    $$('[data-pillar]').forEach((el) => {
      const word = el.dataset.pillar;
      const w = measureEm(word);
      el.style.setProperty('--w', w.toFixed(3));
      if (el.classList.contains('pillar')) max = Math.max(max, w);
    });
    const list = $('[data-pillars]');
    if (list && max) list.style.setProperty('--w-max', (max + 0.06).toFixed(3));
  };

  /* ---------------------------------------------------------------
     Header: transparent at the top, ivory once scrolled, hides on the
     way down and returns on the way up.
  --------------------------------------------------------------- */
  const header = $('[data-header]');
  let lastY = window.scrollY;
  const updateHeader = () => {
    const y = window.scrollY;
    header.classList.toggle('is-solid', y > 8);
    if (y > lastY + 4 && y > 120) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y <= 120) header.classList.remove('is-hidden');
    lastY = y;
  };
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));

  /* ---------------------------------------------------------------
     Dialog helpers
  --------------------------------------------------------------- */
  const openDialog = (dialog, { modal = true } = {}) => {
    if (dialog.open) return;
    if (modal) { dialog.showModal(); lock(true); dialog.dataset.modal = '1'; }
    else { dialog.show(); dialog.dataset.modal = ''; }
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  };
  const closeDialog = (dialog, ms = 320) => new Promise((resolve) => {
    if (!dialog.open) return resolve();
    dialog.classList.remove('is-open');
    const done = () => {
      if (dialog.open) dialog.close();
      if (dialog.dataset.modal) lock(false);
      resolve();
    };
    if (reduced()) done(); else setTimeout(done, ms);
  });

  /* ---------------------------------------------------------------
     Navigation: smooth scroll to a section; the mobile menu
  --------------------------------------------------------------- */
  const menu = $('#menu');
  const menuBtn = $('[data-menu-open]');
  menuBtn.addEventListener('click', () => openDialog(menu));
  $('[data-menu-close]').addEventListener('click', () => closeDialog(menu).then(() => menuBtn.focus()));
  menu.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(menu).then(() => menuBtn.focus()); });
  wideMQ.addEventListener('change', () => { if (menu.open) closeDialog(menu, 0); });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target || !target.classList.contains('sheet')) return;
    e.preventDefault();
    const go = () => {
      window.scrollTo({ top: sheetTop(target), behavior: reduced() ? 'auto' : 'smooth' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    if (menu.open) closeDialog(menu, 200).then(go); else go();
  });

  /* ---------------------------------------------------------------
     1. Hero rotation. The word and field never move; only the cutout
     changes. Slides come from img/hero/slides.json, so adding one is:
     drop the two image sizes in the folder and add a line to the list.
  --------------------------------------------------------------- */
  const heroBox = $('[data-hero]');
  const hero = { i: 0, imgs: [], elapsed: 0, paused: false, DUR: 6000, timer: 0 };
  const heroShow = (i) => {
    hero.i = (i + hero.imgs.length) % hero.imgs.length;
    hero.elapsed = 0;
    const img = hero.imgs[hero.i];
    const activate = () => {
      hero.imgs.forEach((el, n) => {
        el.classList.toggle('is-active', n === hero.i);
        el.setAttribute('aria-hidden', n === hero.i ? 'false' : 'true');
      });
      $$('.dash', $('[data-hero-dashes]')).forEach((d, n) => d.setAttribute('aria-current', n === hero.i ? 'true' : 'false'));
    };
    if (img.decode) img.decode().then(activate, activate); else activate();
  };
  const initHero = async () => {
    if (!heroBox) return;
    const first = $('.hero__figure', heroBox);
    hero.imgs = [first];
    let slides = [];
    try {
      const res = await fetch('img/hero/slides.json', { cache: 'no-cache' });
      if (res.ok) slides = await res.json();
    } catch (err) { slides = []; }
    if (!Array.isArray(slides) || slides.length < 2) return;
    slides.slice(1).forEach((s) => {
      const img = new Image();
      img.className = 'hero__figure';
      img.alt = s.alt || '';
      img.width = 1600; img.height = 1063; img.decoding = 'async';
      img.sizes = first.sizes;
      img.srcset = `img/hero/${s.file}-900.webp 900w, img/hero/${s.file}-1600.webp 1600w`;
      img.src = `img/hero/${s.file}-900.webp`;
      img.setAttribute('aria-hidden', 'true');
      heroBox.append(img);
      hero.imgs.push(img);
    });
    const controls = $('[data-hero-controls]');
    const dashes = $('[data-hero-dashes]');
    hero.imgs.forEach((_, n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dash';
      b.setAttribute('aria-label', `Picture ${n + 1} of ${hero.imgs.length}`);
      b.setAttribute('aria-current', n === 0 ? 'true' : 'false');
      b.addEventListener('click', () => heroShow(n));
      dashes.append(b);
    });
    const toggle = $('[data-hero-toggle]');
    const setPaused = (p) => {
      hero.paused = p;
      toggle.setAttribute('aria-pressed', String(p));
      toggle.setAttribute('aria-label', p ? 'Play the changing pictures' : 'Pause the changing pictures');
    };
    toggle.addEventListener('click', () => setPaused(!hero.paused));
    if (reduced()) setPaused(true);      // nothing auto-plays under reduced motion
    reduceMQ.addEventListener('change', () => { if (reduced()) setPaused(true); });
    controls.hidden = false;
    // Rotation pauses when the tab is hidden, the hero is covered or off screen, or the user pauses it.
    hero.timer = setInterval(() => {
      if (hero.paused || document.hidden || !view.hero || locks > 0) return;
      hero.elapsed += 250;
      if (hero.elapsed >= hero.DUR) heroShow(hero.i + 1);
    }, 250);
  };

  /* ---------------------------------------------------------------
     2. Vision. Each panel is cloned from its strip, so the two views
     are the same assets. Opening moves the field, the word and the
     student from their strip positions to their panel positions.
  --------------------------------------------------------------- */
  const stage = $('[data-stage]');
  const track = $('[data-stage-track]');
  const pillars = $$('.pillar');
  const panels = [];
  const vision = { i: 0, busy: false, anims: [] };
  const PARTS = [['.pillar__field', '.panel__field'], ['.pillar__word', '.panel__word'], ['.pillar__figure', '.panel__figure']];

  const buildPanels = () => {
    pillars.forEach((p, i) => {
      const name = p.dataset.pillar;
      const panel = document.createElement('article');
      panel.className = 'panel';
      panel.dataset.pillar = name;
      panel.style.cssText = p.getAttribute('style');
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-roledescription', 'slide');
      panel.setAttribute('aria-label', `${i + 1} of ${pillars.length}: ${name}`);

      const field = document.createElement('div');
      field.className = 'panel__field';
      const word = document.createElement('h2');
      word.className = 'panel__word';
      word.textContent = name;
      if ($('.pillar__word', p).hasAttribute('data-notch')) word.setAttribute('data-notch', '');
      const srcFig = $('.pillar__figure', p);
      const fig = srcFig.cloneNode();
      fig.className = 'panel__figure';
      fig.removeAttribute('loading');
      fig.removeAttribute('srcset');
      fig.removeAttribute('style');
      fig.src = srcFig.getAttribute('src');
      fig.dataset.hi = srcFig.getAttribute('src').replace('-700.', '-1400.');
      const line = document.createElement('p');
      line.className = 'label panel__line';
      line.textContent = p.dataset.line;
      const dashes = document.createElement('div');
      dashes.className = 'dashes panel__dashes';
      pillars.forEach((q, n) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'dash';
        b.setAttribute('aria-label', `${q.dataset.pillar}, ${n + 1} of ${pillars.length}`);
        b.setAttribute('aria-current', n === i ? 'true' : 'false');
        b.addEventListener('click', () => visionGo(n));
        dashes.append(b);
      });
      panel.append(field, word, fig, line, dashes);
      track.append(panel);
      panels.push(panel);
      $('.pillar__btn', p).addEventListener('click', () => visionOpen(i));
    });
  };

  const upgradeFigure = (panel) => {
    const fig = $('.panel__figure', panel);
    if (!fig.dataset.hi) return;
    const hi = new Image();
    hi.src = fig.dataset.hi;
    delete fig.dataset.hi;
    const swap = () => { fig.src = hi.src; };
    if (hi.decode) hi.decode().then(swap, () => {}); else hi.onload = swap;
  };

  const visionSetCurrent = (i) => {
    vision.i = i;
    const p = pillars[i];
    stage.style.setProperty('--c', getComputedStyle(p).getPropertyValue('--c'));
    stage.style.setProperty('--on', getComputedStyle(p).getPropertyValue('--on'));
    $('[data-stage-label]').style.setProperty('--c', `var(--${p.dataset.pillar})`);
    $('[data-stage-prev]').disabled = i === 0;
    $('[data-stage-next]').disabled = i === pillars.length - 1;
    $('[data-stage-live]').textContent = `${p.dataset.pillar}. ${p.dataset.line}. ${i + 1} of ${pillars.length}.`;
    panels.forEach((panel, n) => { panel.inert = n !== i; });
    upgradeFigure(panels[i]);
  };
  const visionGo = (i, smooth = true) => {
    i = Math.max(0, Math.min(pillars.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
    visionSetCurrent(i);
  };

  // FLIP: place the panel's element on top of the strip's, then let it travel to its own position.
  const flip = (fromEl, toEl, reverse) => {
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    const at = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
    const frames = [{ transform: at }, { transform: 'translate(0px, 0px) scale(1, 1)' }];
    return toEl.animate(reverse ? frames.reverse() : frames, { duration: 640, easing: EASE, fill: 'both' });
  };
  const clearAnims = () => { vision.anims.forEach((a) => a && a.cancel()); vision.anims = []; };

  const visionOpen = async (i) => {
    if (vision.busy || stage.open) return;
    vision.busy = true;
    stage.showModal();
    lock(true);
    track.scrollLeft = i * track.clientWidth;
    visionSetCurrent(i);
    const p = pillars[i];
    const panel = panels[i];
    if (!reduced()) {
      vision.anims = PARTS.map(([from, to]) => flip($(from, p), $(to, panel), false));
      p.classList.add('is-lifted');
    }
    stage.classList.add('is-open');
    await Promise.all(vision.anims.map((a) => a && a.finished.catch(() => {})));
    clearAnims();
    p.classList.remove('is-lifted');
    vision.busy = false;
    $('[data-stage-close]', stage).focus({ preventScroll: true });
  };

  const visionClose = async () => {
    if (vision.busy || !stage.open) return;
    vision.busy = true;
    const p = pillars[vision.i];
    const panel = panels[vision.i];
    stage.classList.remove('is-open');
    if (!reduced()) {
      p.classList.add('is-lifted');
      vision.anims = PARTS.map(([from, to]) => flip($(from, p), $(to, panel), true));
      await Promise.all(vision.anims.map((a) => a && a.finished.catch(() => {})));
    }
    stage.close();
    lock(false);
    p.classList.remove('is-lifted');
    clearAnims();
    vision.busy = false;
    $('.pillar__btn', p).focus({ preventScroll: true });
  };

  const initVision = () => {
    if (!stage || !pillars.length) return;
    buildPanels();
    $$('[data-stage-close]').forEach((b) => b.addEventListener('click', visionClose));
    $('[data-stage-prev]').addEventListener('click', () => visionGo(vision.i - 1));
    $('[data-stage-next]').addEventListener('click', () => visionGo(vision.i + 1));
    stage.addEventListener('cancel', (e) => { e.preventDefault(); visionClose(); });
    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); visionGo(vision.i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); visionGo(vision.i - 1); }
    });
    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (vision.busy || !track.clientWidth) return;
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== vision.i) visionSetCurrent(i);
      });
    }, { passive: true });
    window.addEventListener('resize', () => { if (stage.open) track.scrollLeft = vision.i * track.clientWidth; });

    // Strips slide in when the section enters view.
    const section = $('.vision');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { section.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.25 });
      io.observe(section);
    } else section.classList.add('is-in');
  };

  /* ---------------------------------------------------------------
     3. What We Offer. One state drives everything: the selected
     offering, the timer, the bars, the desktop names and the emblem.
  --------------------------------------------------------------- */
  const offerEl = $('[data-offer]');
  const offer = {
    i: 0, elapsed: 0, DUR: 5000,
    stopped: false,     // the first swipe, tap or key press ends auto-advance
    paused: false,      // the pause button
    hover: false,       // desktop: hovering or focusing a name holds the cycle
    looping: false, last: 0, programmatic: false,
  };
  let oViewport, oSlides = [], oFills = [], oFillsWide = [], oTabs = [], oEmblem, oLive, oToggle;

  const offerAuto = () => !offer.stopped && !offer.paused && !reduced();
  const offerRunning = () => offerAuto() && !offer.hover && !document.hidden && view.offer && locks === 0;

  const offerRender = () => {
    const p = offerAuto() ? Math.min(1, offer.elapsed / offer.DUR) : 1;
    const at = (n) => (n < offer.i ? 1 : n === offer.i ? p : 0);
    oFills.forEach((f, n) => { f.style.transform = `scaleX(${at(n)})`; });
    oFillsWide.forEach((f, n) => { f.style.transform = `scaleX(${at(n)})`; });
    const complete = offer.i + (p >= 1 ? 1 : 0);
    oEmblem.style.clipPath = `inset(0 ${100 - complete * 25}% 0 0)`;
  };
  const offerRenderIndex = () => {
    oSlides.forEach((s, n) => s.classList.toggle('is-active', n === offer.i));
    oTabs.forEach((t, n) => {
      t.classList.toggle('is-active', n === offer.i);
      t.setAttribute('aria-current', n === offer.i ? 'true' : 'false');
    });
    oLive.textContent = `${$('.offer__name', oSlides[offer.i]).textContent}. ${$('.offer__line', oSlides[offer.i]).textContent} ${offer.i + 1} of ${oSlides.length}.`;
  };
  const offerStep = () => (oSlides[1].offsetLeft - oSlides[0].offsetLeft) || 1;

  // The single way the selection changes.
  const offerGo = (i, { scroll = true, smooth = true } = {}) => {
    const count = oSlides.length;
    const wrapped = i >= count || i < 0;
    const next = ((i % count) + count) % count;
    if (wrapped || next < offer.i) {
      offerEl.classList.add('is-resetting');
      setTimeout(() => offerEl.classList.remove('is-resetting'), 360);
    }
    offer.i = next;
    offer.elapsed = 0;
    offerRenderIndex();
    offerRender();
    if (scroll && !wideMQ.matches) {
      // Going forward past the last slide scrolls on to its clone, then snaps back unseen.
      const pos = (i >= count ? count : next) * offerStep();
      offer.programmatic = true;
      oViewport.scrollTo({ left: pos, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
    }
    offerKick();
  };

  const offerLoop = (now) => {
    if (!offerRunning()) { offer.looping = false; return; }
    offer.elapsed += Math.min(120, now - offer.last);
    offer.last = now;
    if (offer.elapsed >= offer.DUR) offerGo(offer.i + 1);
    else offerRender();
    requestAnimationFrame(offerLoop);
  };
  function offerKick() {
    if (offer.looping || !offerRunning()) return;
    offer.looping = true;
    offer.last = performance.now();
    requestAnimationFrame(offerLoop);
  }
  const offerStop = () => {
    if (offer.stopped) return;
    offer.stopped = true;
    offerRender();
  };
  const offerSettle = () => {
    // After any scroll comes to rest: read the selection back from the track.
    if (wideMQ.matches) return;
    const count = oSlides.length;
    const step = offerStep();
    let n = Math.round(oViewport.scrollLeft / step);
    if (n >= count) {                       // resting on the clone of the first slide
      oViewport.scrollTo({ left: 0, behavior: 'auto' });
      n = 0;
    }
    const wasProgrammatic = offer.programmatic;
    offer.programmatic = false;
    if (n !== offer.i) {
      if (!wasProgrammatic) offerStop();
      offer.i = n; offer.elapsed = 0;
      offerRenderIndex(); offerRender();
    }
  };

  const initOffer = () => {
    if (!offerEl) return;
    oViewport = $('[data-offer-viewport]');
    oSlides = $$('[data-offer-slide]');
    oFills = $$('[data-offer-fill]');
    oFillsWide = $$('[data-offer-fill-wide]');
    oTabs = $$('[data-offer-tab]');
    oEmblem = $('.emblem__colour', offerEl);
    oLive = $('[data-offer-live]');
    oToggle = $('[data-offer-toggle]');

    // A copy of the first slide after the last one, so the loop keeps moving the same way.
    const clone = oSlides[0].cloneNode(true);
    clone.classList.add('is-clone');
    clone.classList.remove('is-active');
    clone.removeAttribute('data-offer-slide');
    clone.setAttribute('aria-hidden', 'true');
    clone.inert = true;
    oSlides[0].parentNode.append(clone);

    // The first swipe, tap or key press stops the auto-advance.
    ['pointerdown', 'touchstart', 'wheel'].forEach((type) => {
      oViewport.addEventListener(type, () => { if (!wideMQ.matches) { offer.programmatic = false; offerStop(); } }, { passive: true });
    });
    oViewport.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      offerStop();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const count = oSlides.length;
      if (wideMQ.matches) offerGo(offer.i + dir, { scroll: false });
      else offerGo((offer.i + dir + count) % count);
    });
    let settleTimer = 0;
    const onSettle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(offerSettle, 'onscrollend' in window ? 0 : 140); };
    if ('onscrollend' in window) oViewport.addEventListener('scrollend', onSettle, { passive: true });
    else oViewport.addEventListener('scroll', onSettle, { passive: true });

    // Desktop: hovering or focusing a name jumps there and holds; leaving resumes.
    oTabs.forEach((tab, n) => {
      const enter = () => { offer.hover = true; if (n !== offer.i) offerGo(n, { scroll: false }); };
      tab.addEventListener('mouseenter', enter);
      tab.addEventListener('focus', enter);
      tab.addEventListener('click', () => { if (n !== offer.i) offerGo(n, { scroll: false }); });
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const to = (n + (e.key === 'ArrowRight' ? 1 : -1) + oTabs.length) % oTabs.length;
        oTabs[to].focus();
      });
    });
    const nav = $('.offer__nav', offerEl);
    const leave = () => { offer.hover = false; offerKick(); };
    nav.addEventListener('mouseleave', leave);
    nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget)) leave(); });

    oToggle.addEventListener('click', () => {
      offer.paused = !offer.paused;
      if (!offer.paused) offer.stopped = false;   // pressing play restarts the cycle
      oToggle.setAttribute('aria-pressed', String(offer.paused));
      oToggle.setAttribute('aria-label', offer.paused ? 'Play the changing photographs' : 'Pause the changing photographs');
      offerRender();
      offerKick();
    });
    if (reduced()) { offer.paused = true; oToggle.setAttribute('aria-pressed', 'true'); oToggle.setAttribute('aria-label', 'Play the changing photographs'); }

    wideMQ.addEventListener('change', () => {
      oViewport.scrollTo({ left: wideMQ.matches ? 0 : offer.i * offerStep(), behavior: 'auto' });
      offerRender();
    });
    document.addEventListener('visibilitychange', offerKick);
    offerRenderIndex();
    offerRender();
  };

  /* ---------------------------------------------------------------
     4. Connect. The script word is live text; it writes on with a
     left-to-right reveal, holds, wipes away, and the next writes in.
  --------------------------------------------------------------- */
  const connectEl = $('[data-connect]');
  const AUD = ['student', 'parent', 'mentor', 'school partner'];
  const AUD_VAR = { student: 'student', parent: 'parent', mentor: 'mentor', 'school partner': 'partner' };
  const connect = { i: 0, run: 0, cycling: true, ratios: {} };
  let scriptEl, tabEls = [], underline, formSheet, formOpenBtn;

  const SHOWN = 'inset(-30% -8% -45% -8%)';
  const HIDDEN_RIGHT = 'inset(-30% 108% -45% -8%)';   // nothing revealed yet: the right edge sits at the left
  const HIDDEN_LEFT = 'inset(-30% -8% -45% 108%)';    // wiped away: the left edge has passed to the right

  const fitScript = () => {
    const word = AUD[connect.i];
    if (!connect.ratios[word]) {
      const probe = scriptEl.cloneNode(true);
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:100px;transform:none;clip-path:none;';
      probe.textContent = word;
      document.body.append(probe);
      connect.ratios[word] = probe.getBoundingClientRect().width / 100;
      probe.remove();
    }
    const ima = $('.connect__ima', connectEl);
    const title = $('.connect__title', connectEl);
    const avail = Math.min(title.clientWidth, wideMQ.matches ? window.innerWidth * 0.5 : window.innerWidth - 2 * parseFloat(getComputedStyle(connectEl.firstElementChild).paddingLeft)) * 0.985;
    const cap = parseFloat(getComputedStyle(ima).fontSize) * 2.3;
    scriptEl.style.setProperty('--script-size', Math.min(cap, avail / connect.ratios[word]).toFixed(1) + 'px');
  };

  const moveUnderline = () => {
    const tab = tabEls[connect.i];
    const box = tab.parentNode.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    const pad = 8;
    underline.style.setProperty('--x', (r.left - box.left + pad) + 'px');
    underline.style.setProperty('--sx', ((r.width - pad * 2) / 100).toFixed(3));
    underline.style.setProperty('--c', `var(--${AUD_VAR[AUD[connect.i]]})`);
  };

  const setAudienceState = (i) => {
    connect.i = i;
    const word = AUD[i];
    const colour = `var(--${AUD_VAR[word]})`;
    scriptEl.textContent = word;
    scriptEl.style.setProperty('--c', colour);
    connectEl.style.setProperty('--c', colour);
    tabEls.forEach((t, n) => t.setAttribute('aria-pressed', n === i ? 'true' : 'false'));
    fitScript();
    moveUnderline();
    if (formSheet.open) showForm(word);
  };

  const scriptAnimate = (from, to, duration, easing) => {
    if (reduced()) { scriptEl.style.clipPath = 'none'; return Promise.resolve(); }
    const a = scriptEl.animate([{ clipPath: from }, { clipPath: to }], { duration, easing, fill: 'both' });
    return a.finished.catch(() => {});
  };
  const writeOn = () => scriptAnimate(HIDDEN_RIGHT, SHOWN, 950, 'cubic-bezier(0.5, 0, 0.2, 1)');
  const wipeOff = (ms = 460) => scriptAnimate(SHOWN, HIDDEN_LEFT, ms, 'cubic-bezier(0.6, 0, 0.3, 1)');
  const connectIdle = () => view.connect && !document.hidden && locks === 0 && !formSheet.open;

  const cycle = async () => {
    const my = ++connect.run;
    await writeOn();
    while (my === connect.run && connect.cycling && !reduced()) {
      await wait(1900);
      while (my === connect.run && !connectIdle()) await wait(400);
      if (my !== connect.run) return;
      await wipeOff();
      if (my !== connect.run) return;
      setAudienceState((connect.i + 1) % AUD.length);
      await writeOn();
    }
  };
  const pickAudience = async (i) => {
    connect.cycling = false;            // tapping a tab stops the cycle
    const my = ++connect.run;
    if (i === connect.i) { scriptEl.getAnimations().forEach((a) => a.finish()); scriptAnimate(SHOWN, SHOWN, 1, 'linear'); return; }
    moveUnderlineTo(i);
    await wipeOff(240);
    if (my !== connect.run) return;
    setAudienceState(i);
    await writeOn();
  };
  const moveUnderlineTo = (i) => { const keep = connect.i; connect.i = i; moveUnderline(); tabEls.forEach((t, n) => t.setAttribute('aria-pressed', n === i ? 'true' : 'false')); connect.i = keep; };

  /* ---- Demo forms: validated in the browser, never sent anywhere ---- */
  const showForm = (word) => {
    $$('.form', formSheet).forEach((f) => { f.hidden = f.dataset.form !== word; });
    $('[data-form-done]', formSheet).hidden = true;
    $('[data-form-aud]', formSheet).textContent = word;
    const form = $(`.form[data-form="${word}"]`, formSheet);
    $$('.field, .form__submit', form).forEach((el, n) => el.style.setProperty('--n', n));
    return form;
  };
  const openForm = () => {
    connect.cycling = false;
    connect.run++;
    scriptEl.getAnimations().forEach((a) => a.cancel());
    scriptEl.style.clipPath = 'none';
    const form = showForm(AUD[connect.i]);
    openDialog(formSheet, { modal: !wideMQ.matches });
    formOpenBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => { const first = $('input, select, textarea', form); if (first) first.focus({ preventScroll: true }); }, reduced() ? 0 : 380);
  };
  const closeForm = async () => {
    await closeDialog(formSheet, 420);
    formOpenBtn.setAttribute('aria-expanded', 'false');
    $$('.form', formSheet).forEach((f) => { f.reset(); clearErrors(f); });
    formOpenBtn.focus({ preventScroll: true });
  };
  const setError = (input, message) => {
    const err = document.getElementById(input.id + '-e');
    if (!err) return;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id);
      err.textContent = message;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      err.hidden = true;
      err.textContent = '';
    }
  };
  const clearErrors = (form) => $$('input, select, textarea', form).forEach((el) => setError(el, ''));
  const validate = (input) => {
    const label = $(`label[for="${input.id}"]`);
    const name = label ? label.firstChild.textContent.trim().toLowerCase() : 'this field';
    const value = input.value.trim();
    if (input.required && !value) return input.tagName === 'SELECT' ? `Choose ${name}.` : `Add ${name}.`;
    if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a full email address.';
    return '';
  };

  const initConnect = () => {
    if (!connectEl) return;
    scriptEl = $('[data-script]');
    tabEls = $$('.connect__tab', connectEl);
    underline = $('[data-underline]');
    formSheet = $('[data-form-sheet]');
    formOpenBtn = $('[data-form-open]');

    tabEls.forEach((tab, n) => {
      tab.addEventListener('click', () => pickAudience(n));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const to = (n + (e.key === 'ArrowRight' ? 1 : -1) + tabEls.length) % tabEls.length;
        tabEls[to].focus();
        pickAudience(to);
      });
    });
    formOpenBtn.setAttribute('aria-expanded', 'false');
    formOpenBtn.addEventListener('click', openForm);
    $$('[data-form-close]', formSheet).forEach((b) => b.addEventListener('click', closeForm));
    formSheet.addEventListener('cancel', (e) => { e.preventDefault(); closeForm(); });
    formSheet.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !formSheet.dataset.modal) { e.preventDefault(); closeForm(); } });
    wideMQ.addEventListener('change', () => { if (formSheet.open) closeForm(); });

    $$('.form', formSheet).forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();             // front-end demo: no request is ever made
        const inputs = $$('input, select, textarea', form);
        let firstBad = null;
        inputs.forEach((input) => {
          const message = validate(input);
          setError(input, message);
          if (message && !firstBad) firstBad = input;
        });
        if (firstBad) { firstBad.focus(); return; }
        form.hidden = true;
        form.reset();
        const done = $('[data-form-done]', formSheet);
        done.hidden = false;
        done.focus();
      });
      form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid')) setError(e.target, validate(e.target)); });
    });

    setAudienceState(0);
    if (reduced()) { connect.cycling = false; scriptEl.style.clipPath = 'none'; }
    else {
      // Start the cycle the first time the section comes into view.
      scriptEl.style.clipPath = HIDDEN_RIGHT;
      connect.start = () => { if (view.connect) { connect.start = null; scriptEl.style.clipPath = ''; cycle(); } };
      connect.start();
    }
  };

  /* ---------------------------------------------------------------
     Start
  --------------------------------------------------------------- */
  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateSheets();
      updateHeader();
      offerKick();
      if (connect.start) connect.start();
    });
  };
  const onResize = () => {
    updateSheets();
    if (connectEl && scriptEl) { fitScript(); moveUnderline(); }
  };

  fitWords();
  updateSheets();
  updateHeader();
  initVision();
  initOffer();
  initConnect();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { fitWords(); connect.ratios = {}; onResize(); });
  }
  window.addEventListener('load', () => { onResize(); initHero(); offerKick(); });
})();
