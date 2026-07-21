/**
 * Collection affixed-header mode is disabled for now.
 * Never show the compact affixed header / stuck facets bar,
 * including the collapsed ("rested") state.
 */
const clearAffixedState = () => {
  const header = document.getElementById('header-component');
  if (header instanceof HTMLElement) {
    header.removeAttribute('data-collection-facets-affixed');
    header.removeAttribute('data-collection-header-expanded');
  }

  document.querySelectorAll('.facets-block-wrapper--horizontal, .facets-toggle').forEach((bar) => {
    bar.classList.remove('is-facets-stuck');
  });

  document.querySelectorAll('.header-collection-expand').forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = true;
  });
};

clearAffixedState();
window.addEventListener('collection:facets-rendered', clearAffixedState);
window.addEventListener('collection:header-expanded', clearAffixedState);
document.addEventListener('shopify:section:load', clearAffixedState);
window.addEventListener('resize', clearAffixedState, { passive: true });
window.addEventListener('scroll', clearAffixedState, { passive: true });
