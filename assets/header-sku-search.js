import { initSkuSearchForms } from '@theme/sku-search';
import { lockScroll, unlockScroll } from '@theme/utilities';

const SELECTORS = {
  root: '[data-header-sku-search]',
  toggle: '[data-header-sku-search-toggle]',
  panel: '[data-header-sku-search-panel]',
  input: '[data-collection-sku-search-input]',
};

const BACKDROP_CLASS = 'header-sku-search-backdrop';

/** @type {HTMLElement | null} */
let activeRoot = null;

/** @type {HTMLElement | null} */
let backdropEl = null;

/** @type {ResizeObserver | null} */
let headerStackObserver = null;

/** @type {number | null} */
let closeTimer = null;

const PANEL_TRANSITION_MS = 380;

const syncOverlayTop = () => {
  const headerSection = document.querySelector('.header-section');
  const fallback = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--header-height'));
  const top =
    headerSection instanceof HTMLElement
      ? Math.max(0, Math.round(headerSection.getBoundingClientRect().bottom))
      : Number.isFinite(fallback)
        ? Math.max(0, Math.round(fallback))
        : 0;

  document.body.style.setProperty('--header-sku-search-top', `${top}px`);
  document.body.style.setProperty('--page-scrollbar-width', `${getPageScrollbarWidth()}px`);
};

const getPageScrollbarWidth = () => {
  const pageWrapper = document.querySelector('.page-wrapper');
  if (window.matchMedia('(min-width: 990px)').matches && pageWrapper instanceof HTMLElement) {
    return Math.max(0, pageWrapper.offsetWidth - pageWrapper.clientWidth);
  }
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
};

const observeHeaderStack = (enabled) => {
  const headerSection = document.querySelector('.header-section');

  if (!enabled) {
    headerStackObserver?.disconnect();
    headerStackObserver = null;
    window.removeEventListener('resize', syncOverlayTop);
    window.removeEventListener('scroll', syncOverlayTop, true);
    return;
  }

  if (!headerStackObserver && headerSection instanceof HTMLElement) {
    headerStackObserver = new ResizeObserver(syncOverlayTop);
    headerStackObserver.observe(headerSection);
  }

  window.addEventListener('resize', syncOverlayTop);
  window.addEventListener('scroll', syncOverlayTop, true);
};

const getBackdrop = () => {
  if (backdropEl instanceof HTMLElement) return backdropEl;

  const existing = document.querySelector(`.${BACKDROP_CLASS}`);
  if (existing instanceof HTMLElement) {
    backdropEl = existing;
    return backdropEl;
  }

  const backdrop = document.createElement('div');
  backdrop.className = BACKDROP_CLASS;
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.addEventListener('click', () => closePanel());
  document.body.appendChild(backdrop);
  backdropEl = backdrop;
  return backdrop;
};

const showBackdrop = () => {
  const backdrop = getBackdrop();
  // Force a reflow so the fade-in always plays when reopening.
  void backdrop.offsetWidth;
  backdrop.classList.add('is-visible');
};

const hideBackdrop = () => {
  getBackdrop().classList.remove('is-visible');
};

const closePanel = () => {
  if (!activeRoot) return;

  const root = activeRoot;
  const toggle = root.querySelector(SELECTORS.toggle);
  const panel = root.querySelector(SELECTORS.panel);

  observeHeaderStack(false);
  unlockScroll(root);
  document.documentElement.removeAttribute('data-header-overlay-lock');

  root.classList.remove('is-open');
  hideBackdrop();
  if (toggle instanceof HTMLElement) toggle.setAttribute('aria-expanded', 'false');
  activeRoot = null;

  if (closeTimer != null) window.clearTimeout(closeTimer);
  const shouldAnimate =
    window.matchMedia('(max-width: 749px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = shouldAnimate ? PANEL_TRANSITION_MS : 0;
  closeTimer = window.setTimeout(() => {
    if (panel instanceof HTMLElement && !root.classList.contains('is-open')) panel.hidden = true;
    closeTimer = null;
  }, delay);
};

const openPanel = (root) => {
  const toggle = root.querySelector(SELECTORS.toggle);
  const panel = root.querySelector(SELECTORS.panel);
  const input = root.querySelector(SELECTORS.input);

  if (!(panel instanceof HTMLElement) || !(toggle instanceof HTMLElement)) return;

  if (closeTimer != null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  document.dispatchEvent(new CustomEvent('header-sku-search:open'));
  activeRoot = root;
  syncOverlayTop();
  observeHeaderStack(true);
  panel.hidden = false;
  document.documentElement.setAttribute('data-header-overlay-lock', '');
  lockScroll(root);
  toggle.setAttribute('aria-expanded', 'true');
  initSkuSearchForms();

  // Render the off-canvas state before adding the open class so mobile can slide in.
  void panel.offsetWidth;
  window.requestAnimationFrame(() => {
    if (activeRoot !== root) return;
    root.classList.add('is-open');
    showBackdrop();
    syncOverlayTop();
    if (input instanceof HTMLInputElement) input.focus({ preventScroll: true });
  });
};

const initHeaderSkuSearch = () => {
  document.querySelectorAll(SELECTORS.root).forEach((root) => {
    if (!(root instanceof HTMLElement) || root.dataset.headerSkuSearchInitialized === 'true') return;
    root.dataset.headerSkuSearchInitialized = 'true';

    const toggle = root.querySelector(SELECTORS.toggle);
    if (!(toggle instanceof HTMLElement)) return;

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (activeRoot === root && root.classList.contains('is-open')) {
        closePanel();
        return;
      }

      closePanel();
      openPanel(root);
    });
  });
};

document.addEventListener('click', (event) => {
  if (!activeRoot) return;
  if (event.target instanceof Node && activeRoot.contains(event.target)) return;
  if (event.target instanceof Node && getBackdrop().contains(event.target)) return;
  closePanel();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});

document.addEventListener('catalog-nav:open', () => closePanel());

initHeaderSkuSearch();
document.addEventListener('shopify:section:load', initHeaderSkuSearch);
