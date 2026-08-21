(() => {
  const nav = document.querySelector('.homepage-section-nav');
  if (!nav) return;

  const ticks = [...nav.querySelectorAll('[data-homepage-tick]')];
  const sections = ticks
    .map((tick) => {
      const key = tick.getAttribute('data-homepage-tick');
      const target = document.querySelector(`[data-homepage-section="${key}"]`);
      return { tick, key, target, box: target?.closest('.shopify-section') ?? target };
    })
    .filter((item) => item.box);

  if (sections.length === 0) {
    nav.remove();
    return;
  }

  const getScroller = () => {
    const wrapper = document.querySelector('.page-wrapper');
    if (wrapper) {
      const overflowY = getComputedStyle(wrapper).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return wrapper;
    }
    return window;
  };

  const headerOffset = () => {
    const raw = getComputedStyle(document.body).getPropertyValue('--header-height');
    const fromVar = Number.parseFloat(raw);
    if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;

    const header = document.querySelector('#header-component, .header-section');
    return header?.getBoundingClientRect().height ?? 0;
  };

  const setActive = (key) => {
    ticks.forEach((tick) => {
      const isActive = tick.getAttribute('data-homepage-tick') === key;
      tick.classList.toggle('is-active', isActive);
      tick.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  };

  const updateActiveFromScroll = () => {
    const marker = window.innerHeight * 0.42;
    let activeKey = sections[0].key;

    sections.forEach(({ key, box }) => {
      const rect = box.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > marker) {
        activeKey = key;
      }
    });

    setActive(activeKey);
  };

  const scrollToSection = (key) => {
    const match = sections.find((item) => item.key === key);
    if (!match) return;

    const scroller = getScroller();
    const offset = key === 'hero' ? 0 : headerOffset();

    if (scroller === window) {
      const top = match.box.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }

    const top =
      match.box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  ticks.forEach((tick) => {
    tick.addEventListener('click', (event) => {
      event.preventDefault();
      const key = tick.getAttribute('data-homepage-tick');
      scrollToSection(key);
      setActive(key);
    });
  });

  const wrapper = document.querySelector('.page-wrapper');
  window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
  wrapper?.addEventListener('scroll', updateActiveFromScroll, { passive: true });
  window.addEventListener('resize', updateActiveFromScroll);
  updateActiveFromScroll();
})();
