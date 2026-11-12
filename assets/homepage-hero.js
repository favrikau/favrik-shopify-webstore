const mobileHeroViewport = window.matchMedia('(max-width: 749px)');
const mobileHeroWidths = new WeakMap();

function syncMobileHeroHeight() {
  document.querySelectorAll('[data-collection-list-showcase]').forEach((section) => {
    const panel = section.querySelector('.resource-list__item');
    if (!(panel instanceof HTMLElement)) return;

    if (!mobileHeroViewport.matches) {
      panel.style.removeProperty('--hero-showcase-panel-height');
      mobileHeroWidths.delete(panel);
      return;
    }

    const width = section.clientWidth;
    if (mobileHeroWidths.get(panel) === width) return;

    // Re-measure for a new screen width, but keep the initial height when the
    // browser toolbar hides/shows during scrolling and only height changes.
    panel.style.removeProperty('--hero-showcase-panel-height');
    const height = panel.getBoundingClientRect().height;
    if (width === 0 || height === 0) return;

    panel.style.setProperty('--hero-showcase-panel-height', `${height}px`);
    mobileHeroWidths.set(panel, width);
  });
}

syncMobileHeroHeight();
window.addEventListener('resize', syncMobileHeroHeight);
document.addEventListener('shopify:section:load', syncMobileHeroHeight);
