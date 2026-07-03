const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isThemeEditor = document.documentElement.classList.contains('shopify-design-mode');

if (!prefersReducedMotion && !isThemeEditor) {
  const pageWrapper = document.querySelector('.page-wrapper');
  const scrollContainers = [document.documentElement, pageWrapper].filter(Boolean);

  scrollContainers.forEach((container) => {
    container.style.scrollBehavior = 'smooth';
  });
}
