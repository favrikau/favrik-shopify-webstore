const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isThemeEditor = document.documentElement.classList.contains('shopify-design-mode');
const hasGsap = typeof window.gsap !== 'undefined';

if (!prefersReducedMotion && !isThemeEditor && hasGsap) {
  const lerp = 0.12;
  const wheelMultiplier = 1;
  const stopThreshold = 0.5;

  let targetY = window.scrollY;
  let currentY = window.scrollY;
  let isSmoothing = false;
  let isProgrammaticScroll = false;

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const clamp = (value) => Math.max(0, Math.min(value, maxScroll()));

  const canScrollInside = (element, deltaY) => {
    let node = element;

    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const allowsScroll = /(auto|scroll)/.test(style.overflowY);

      if (allowsScroll && node.scrollHeight > node.clientHeight) {
        const atTop = node.scrollTop <= 0;
        const atBottom = Math.ceil(node.scrollTop + node.clientHeight) >= node.scrollHeight;

        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) {
          return true;
        }
      }

      node = node.parentElement;
    }

    return false;
  };

  const startSmoothing = () => {
    if (isSmoothing) return;

    isSmoothing = true;
    window.gsap.ticker.add(tick);
  };

  const stopSmoothing = () => {
    isSmoothing = false;
    window.gsap.ticker.remove(tick);
  };

  function tick() {
    const distance = targetY - currentY;

    currentY += distance * lerp;

    if (Math.abs(distance) < stopThreshold) {
      currentY = targetY;
      stopSmoothing();
    }

    isProgrammaticScroll = true;
    window.scrollTo(0, currentY);
    isProgrammaticScroll = false;
  }

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey || canScrollInside(event.target, event.deltaY)) return;

      event.preventDefault();
      targetY = clamp(targetY + event.deltaY * wheelMultiplier);
      startSmoothing();
    },
    { passive: false }
  );

  window.addEventListener(
    'scroll',
    () => {
      if (isProgrammaticScroll) return;

      targetY = window.scrollY;
      currentY = window.scrollY;
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    targetY = clamp(targetY);
    currentY = clamp(currentY);
  });
}
