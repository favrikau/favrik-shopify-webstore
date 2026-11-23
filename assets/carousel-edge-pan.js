/**
 * Edge-hover panning + card settling for desktop product carousels
 * (`slideshow-component[data-edge-pan]`).
 *
 * Zones
 * - Right zone: exactly the half card visible at rest, pinned to the row's right edge. It stays
 *   fixed while the row moves, so cards sliding in can't shrink it out from under the cursor.
 *   It continues past the row to the window edge (page scrollbar included), and panning keeps
 *   going if the cursor leaves the window while panning — forgiving overshoot.
 * - Left zone: the same width at the left edge, active once the row has moved.
 * - A small vertical margin above/below the row is forgiven too.
 *
 * Motion (velocity-continuous — nothing ever jumps)
 * - Panning runs at one constant speed. It eases in over a fixed short time (no lerp chasing a
 *   moving target, so hand wobble never changes the speed) and tapers smoothly into either end.
 * - When panning ends (leaving the zone, releasing a drag, a trackpad swipe stopping) the row
 *   settles so a card lines up exactly with the left margin (or the row's end). The settle
 *   starts at the row's current speed and decelerates exactly onto the card (Hermite curve).
 * - While the row moves, cards ignore the pointer (no hover effects flickering across them).
 * - Dragging (slideshow.js) takes over instantly.
 */
(() => {
  const desktop = window.matchMedia('(min-width: 750px) and (hover: hover) and (pointer: fine)');
  const PAN_SPEED = 0.72; // px per ms (~720px/s) — constant while hovering a zone
  const RAMP_MS = 240; // ease-in time from the current speed up to PAN_SPEED
  const END_TAPER = 0.0075; // near an end, speed (px/ms) ≤ remaining distance (px) × this
  const VERTICAL_TOLERANCE = 32; // px above/below the row that still count as the row
  const DRAG_BIAS = 0.3; // after a drag/swipe, lean this fraction of a card in its direction
  const WHEEL_IDLE_MS = 140; // trackpad swipe (incl. momentum) considered finished after this
  const FRAME = 1000 / 60;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

  /** Scrollers already wired (a WeakSet, so morphs that reset attributes can't double-wire). */
  const wired = new WeakSet();

  /** @param {HTMLElement} slideshow */
  function setup(slideshow) {
    const scroller = slideshow.querySelector(':scope > slideshow-container > slideshow-slides');
    if (!(scroller instanceof HTMLElement) || wired.has(scroller)) return;
    wired.add(scroller);

    /** @type {'idle' | 'pan' | 'settle'} */
    let mode = 'idle';
    let direction = 0; // pan direction: -1, 0, 1
    let velocity = 0; // current signed px/ms
    let position = 0; // sub-pixel scroll position owned by the animation
    let lastTime = 0;
    let frame = 0;
    /** @type {{ from: number, start: number | null }} */
    let ramp = { from: 0, start: null };
    /** @type {{ p0: number, v0: number, p1: number, duration: number, start: number | null } | null} */
    let settleCurve = null;
    let pointerX = -1;
    let pointerY = -1;

    // ---- Layout (cached; card positions within the row don't change while it scrolls) ----

    /** @type {{ padStart: number, snaps: number[], max: number, zoneWidth: number, cardWidth: number } | null} */
    let layout = null;

    const measure = () => {
      const box = scroller.getBoundingClientRect();
      const padStart = parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const scrollLeft = scroller.scrollLeft;
      /** @type {number[]} */
      const snaps = [];
      let zoneWidth = 0;
      let cardWidth = 0;

      for (const slide of scroller.children) {
        const rect = slide.getBoundingClientRect();
        if (rect.width === 0) continue; // hidden (randomised-out) cards
        cardWidth = cardWidth || rect.width;
        const contentLeft = rect.left - box.left + scrollLeft; // position within the scrolled content
        const snap = contentLeft - padStart;
        if (snap < max - 0.5) snaps.push(Math.max(0, snap));
        // The first card not fully visible at rest defines the zone (its visible part).
        if (!zoneWidth && contentLeft + rect.width > scroller.clientWidth + 1) {
          zoneWidth = clamp(scroller.clientWidth - contentLeft, 24, rect.width);
        }
      }
      snaps.push(max);
      layout = { padStart, snaps, max, zoneWidth, cardWidth };
      return layout;
    };

    const getLayout = () => layout ?? measure();
    new ResizeObserver(() => {
      layout = null;
    }).observe(scroller);

    // ---- Zones ----

    /**
     * Pan direction for a pointer position (0 = not in a zone).
     * @param {number} x
     * @param {number} y
     */
    const zoneAt = (x, y) => {
      const { zoneWidth, max } = getLayout();
      const box = scroller.getBoundingClientRect();
      if (!zoneWidth || y < box.top - VERTICAL_TOLERANCE || y > box.bottom + VERTICAL_TOLERANCE) return 0;
      const current = scroller.scrollLeft;
      if (x >= box.right - zoneWidth && current < max - 0.5) return 1;
      if (x <= box.left + zoneWidth && x >= 0 && current > 0.5) return -1;
      return 0;
    };

    /** @param {number} panDirection */
    const setCue = (panDirection) => {
      if (panDirection === 1) scroller.setAttribute('data-edge-pan-active', 'right');
      else if (panDirection === -1) scroller.setAttribute('data-edge-pan-active', 'left');
      else scroller.removeAttribute('data-edge-pan-active');
    };

    /** @param {boolean} moving */
    const setMoving = (moving) => {
      scroller.toggleAttribute('data-edge-pan-moving', moving);
    };

    // ---- Animation ----

    const halt = () => {
      mode = 'idle';
      direction = 0;
      velocity = 0;
      settleCurve = null;
      lastTime = 0;
      setCue(0);
      setMoving(false);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const run = () => {
      setMoving(true);
      if (!frame) frame = requestAnimationFrame(step);
    };

    /** @param {number} left */
    const apply = (left) => {
      // The track has `scroll-behavior: smooth` in the theme; per-frame steps must be instant.
      scroller.scrollTo({ left, behavior: 'instant' });
    };

    /**
     * Settle onto a card. Continues from the current speed (no velocity jump) and lands with
     * zero speed exactly on the card position.
     * @param {number} [hint] - direction to lean when the row is (nearly) stationary
     * @param {boolean} [biased] - stationary: pick the card nearest to a point leaned toward `hint`
     */
    const settle = (hint = 0, biased = false) => {
      if (mode === 'idle') position = scroller.scrollLeft;
      const { snaps, max, cardWidth } = getLayout();
      const p0 = position;
      const v0 = velocity;
      const moving = Math.abs(v0) > 0.02;
      const lean = moving ? Math.sign(v0) : Math.sign(hint);
      let p1;

      if (moving) {
        // Next card ahead that leaves room to decelerate gently (≥ ~70ms of travel).
        const minDistance = Math.abs(v0) * 70;
        p1 =
          lean > 0
            ? snaps.find((p) => p - p0 >= minDistance) ?? max
            : [...snaps].reverse().find((p) => p0 - p >= minDistance) ?? 0;
      } else {
        const aim = biased ? p0 + lean * cardWidth * DRAG_BIAS : p0;
        p1 = snaps.reduce((best, p) => (Math.abs(p - aim) < Math.abs(best - aim) ? p : best), snaps[0] ?? 0);
      }

      const distance = Math.abs(p1 - p0);
      if (distance < 0.5) {
        apply(p1);
        halt();
        return;
      }

      // From the current speed, T = 2·d/v makes the Hermite curve a steady, linear deceleration
      // that lands with zero speed — never shortened, which would make the row surge before
      // slowing (a rubber-band feel). Very slow starts use a gentle distance-scaled ease instead.
      let duration;
      let startVelocity = 0;
      const steady = moving ? (2 * distance) / Math.abs(v0) : Infinity;
      if (steady <= 1400) {
        duration = Math.max(140, steady);
        startVelocity = v0;
      } else {
        duration = clamp(200 + distance * 0.9, 220, 650);
        // Keep any slow initial speed only while it can't overshoot (v·T ≤ 2d).
        startVelocity = moving && Math.abs(v0) * duration <= 2 * distance ? v0 : 0;
      }

      direction = 0;
      setCue(0);
      settleCurve = { p0, v0: startVelocity, p1, duration, start: null };
      mode = 'settle';
      run();
    };

    /** @param {number} panDirection */
    const startPan = (panDirection) => {
      if (mode === 'idle') {
        position = scroller.scrollLeft;
        velocity = 0;
        lastTime = 0;
      }
      // Ramp from whatever speed the row has now (0, mid-settle, or the other direction).
      if (mode !== 'pan' || panDirection !== direction) ramp = { from: velocity, start: null };
      settleCurve = null;
      direction = panDirection;
      mode = 'pan';
      setCue(panDirection);
      run();
    };

    /** @param {number} now */
    function step(now) {
      frame = 0;
      if (slideshow.hasAttribute('dragging')) {
        halt();
        return;
      }

      const elapsed = lastTime ? clamp(now - lastTime, 0, 50) : FRAME;
      lastTime = now;

      if (mode === 'pan') {
        const { max } = getLayout();
        // Something else moved the row (trackpad, keyboard): follow it.
        if (Math.abs(scroller.scrollLeft - position) > 2) position = scroller.scrollLeft;

        if (ramp.start === null) ramp.start = now - elapsed;
        const progress = easeInOutSine(clamp((now - ramp.start) / RAMP_MS, 0, 1));
        velocity = ramp.from + (direction * PAN_SPEED - ramp.from) * progress;

        // Taper into the end of the row: speed never exceeds a fraction of the distance left,
        // so the row decelerates exponentially into the end instead of hitting it.
        const remaining = direction > 0 ? max - position : position;
        const cap = remaining * END_TAPER + 0.01;
        if (Math.abs(velocity) > cap && Math.sign(velocity) === direction) velocity = direction * cap;

        position = clamp(position + velocity * elapsed, 0, max);
        apply(position);

        if (remaining < 0.3) {
          apply(direction > 0 ? max : 0);
          halt(); // the row's end is a resting point
          return;
        }
      } else if (mode === 'settle' && settleCurve) {
        const curve = settleCurve;
        if (curve.start === null) curve.start = now - elapsed;
        const t = clamp((now - curve.start) / curve.duration, 0, 1);
        const t2 = t * t;
        const t3 = t2 * t;
        // Cubic Hermite: starts at p0 with velocity v0, ends at p1 with velocity 0.
        const next =
          (2 * t3 - 3 * t2 + 1) * curve.p0 + (t3 - 2 * t2 + t) * curve.duration * curve.v0 + (-2 * t3 + 3 * t2) * curve.p1;
        velocity = elapsed > 0 ? (next - position) / elapsed : velocity;
        position = next;
        apply(position);

        if (t >= 1) {
          apply(curve.p1);
          halt();
          return;
        }
      } else {
        setMoving(false);
        return;
      }

      frame = requestAnimationFrame(step);
    }

    // ---- Input ----

    /** Re-evaluate the zone for the last known pointer position. */
    const evaluate = () => {
      if (!desktop.matches || slideshow.hasAttribute('dragging') || !scroller.isConnected) return;
      const panDirection = zoneAt(pointerX, pointerY);
      if (panDirection) {
        if (mode !== 'pan' || panDirection !== direction) startPan(panDirection);
      } else if (mode === 'pan') {
        settle(Math.sign(velocity));
      }
    };

    document.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'mouse') return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (event.buttons !== 0) return; // a drag / text selection / scrollbar drag owns the pointer
        evaluate();
      },
      { passive: true }
    );

    // Cursor left the window (e.g. overshooting past the scrollbar): keep the current pan going —
    // the row tapers into its end by itself. Re-entering re-evaluates on the next move.
    document.addEventListener('mouseout', (event) => {
      if (event.relatedTarget === null && mode === 'pan') run();
    });

    // Pressing anywhere ends a hover pan: inside the row a drag takes over (stop now);
    // elsewhere (e.g. grabbing the page scrollbar) settle onto a card.
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target instanceof Node && scroller.contains(event.target)) halt();
        else if (mode === 'pan') settle(Math.sign(velocity));
      },
      { capture: true }
    );

    // The page scrolled under a stationary cursor: the row may have left it.
    document.addEventListener(
      'scroll',
      (event) => {
        if (event.target !== scroller && mode === 'pan') evaluate();
      },
      { capture: true, passive: true }
    );

    window.addEventListener('blur', () => {
      if (mode === 'pan') settle(Math.sign(velocity));
    });

    // Drag (slideshow.js) ends: carry the release speed into the settle so the row glides onto
    // the card it was heading to in one motion (no stop-then-go).
    let dragStart = 0;
    /** @type {Array<[number, number]>} */
    let dragSamples = [];
    scroller.addEventListener(
      'scroll',
      () => {
        if (!slideshow.hasAttribute('dragging')) return;
        dragSamples.push([performance.now(), scroller.scrollLeft]);
        if (dragSamples.length > 12) dragSamples.shift();
      },
      { passive: true }
    );

    new MutationObserver(() => {
      if (slideshow.hasAttribute('dragging')) {
        halt();
        dragStart = scroller.scrollLeft;
        dragSamples = [[performance.now(), dragStart]];
      } else if (desktop.matches) {
        const now = performance.now();
        const moved = scroller.scrollLeft - dragStart;
        // Release speed from the last ~60ms of the drag (0 if the hand had stopped).
        const recent = dragSamples.filter(([t]) => now - t <= 60);
        let releaseVelocity = 0;
        if (recent.length >= 2) {
          const [t0, p0] = recent[0];
          const [t1, p1] = recent[recent.length - 1];
          if (t1 > t0) releaseVelocity = (p1 - p0) / (t1 - t0);
        }
        dragSamples = [];
        position = scroller.scrollLeft;
        velocity = clamp(releaseVelocity, -2.5, 2.5);
        mode = 'settle'; // keep `position`/`velocity` as the starting state
        settle(Math.abs(moved) > 8 ? Math.sign(moved) : 0, true);
      }
    }).observe(slideshow, { attributes: true, attributeFilter: ['dragging'] });

    // Trackpad / shift-wheel swipe ends (momentum included): settle on a card, continuing from
    // the swipe's own end speed so there's no stop-then-go.
    let wheelTimer = 0;
    let wheelDirection = 0;
    /** @type {Array<[number, number]>} */
    let wheelSamples = [];
    scroller.addEventListener(
      'scroll',
      () => {
        if (!wheelTimer) return;
        wheelSamples.push([performance.now(), scroller.scrollLeft]);
        if (wheelSamples.length > 12) wheelSamples.shift();
      },
      { passive: true }
    );
    scroller.addEventListener(
      'wheel',
      (event) => {
        if (!desktop.matches || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        if (mode !== 'idle') halt();
        wheelDirection = Math.sign(event.deltaX);
        clearTimeout(wheelTimer);
        wheelTimer = window.setTimeout(() => {
          wheelTimer = 0;
          const now = performance.now();
          const recent = wheelSamples.filter(([t]) => now - t <= 120);
          let endVelocity = 0;
          if (recent.length >= 2) {
            const [t0, p0] = recent[0];
            const [t1, p1] = recent[recent.length - 1];
            if (t1 > t0) endVelocity = (p1 - p0) / (t1 - t0);
          }
          wheelSamples = [];
          position = scroller.scrollLeft;
          velocity = clamp(endVelocity, -2.5, 2.5);
          mode = 'settle'; // keep `position`/`velocity` as the starting state
          settle(wheelDirection, true);
        }, WHEEL_IDLE_MS);
      },
      { passive: true }
    );

    // 2. Load every card's first photo while the page is idle, so cards entering mid-pan never
    // have to fetch and decode images during the motion.
    const warmImages = () => {
      scroller.querySelectorAll('slideshow-slide[aria-hidden="false"] img[loading="lazy"]').forEach((img) => {
        // Only each card's current photo (not the rest of its gallery).
        if (img.closest('slideshow-slide')?.getAttribute('aria-hidden') === 'false') img.loading = 'eager';
      });
    };
    // Also measure the card layout at idle, so the first hover doesn't pay for it.
    const warm = () => {
      warmImages();
      if (!layout) measure();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
    else setTimeout(warm, 1200);

    desktop.addEventListener('change', halt);
  }

  const init = () => {
    document.querySelectorAll('slideshow-component[data-edge-pan]').forEach((el) => {
      if (el instanceof HTMLElement) setup(el);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);

  // Carousels rendered after load (e.g. product recommendations fetched by JS).
  let pending = 0;
  new MutationObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      init();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
