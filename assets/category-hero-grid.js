const categoryHeroMobileViewport = window.matchMedia('(max-width: 749px)');
const categoryHeroWidths = new WeakMap();

function syncMobileCategoryHeights() {
  document.querySelectorAll('.category-hero-grid').forEach((grid) => {
    const panel = grid.querySelector('.category-hero-grid__window');
    if (!(panel instanceof HTMLElement)) return;

    if (!categoryHeroMobileViewport.matches) {
      grid.style.removeProperty('--category-hero-panel-height');
      categoryHeroWidths.delete(grid);
      return;
    }

    const width = grid.clientWidth;
    if (categoryHeroWidths.get(grid) === width) return;

    // Lock one shared pixel height for all four panels. Toolbar changes while
    // scrolling must not resize them; a new screen width can recalculate it.
    grid.style.removeProperty('--category-hero-panel-height');
    const height = panel.getBoundingClientRect().height;
    if (width === 0 || height === 0) return;

    grid.style.setProperty('--category-hero-panel-height', `${height}px`);
    categoryHeroWidths.set(grid, width);
  });
}

syncMobileCategoryHeights();
window.addEventListener('resize', syncMobileCategoryHeights);
document.addEventListener('shopify:section:load', syncMobileCategoryHeights);
