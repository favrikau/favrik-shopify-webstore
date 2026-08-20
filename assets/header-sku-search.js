import { initSkuSearchForms } from '@theme/sku-search';

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

  const toggle = activeRoot.querySelector(SELECTORS.toggle);
  const panel = activeRoot.querySelector(SELECTORS.panel);

  activeRoot.classList.remove('is-open');
  hideBackdrop();
  if (panel instanceof HTMLElement) panel.hidden = true;
  if (toggle instanceof HTMLElement) toggle.setAttribute('aria-expanded', 'false');
  activeRoot = null;
};

const openPanel = (root) => {
  const toggle = root.querySelector(SELECTORS.toggle);
  const panel = root.querySelector(SELECTORS.panel);
  const input = root.querySelector(SELECTORS.input);

  if (!(panel instanceof HTMLElement) || !(toggle instanceof HTMLElement)) return;

  activeRoot = root;
  root.classList.add('is-open');
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  showBackdrop();
  initSkuSearchForms();

  if (input instanceof HTMLInputElement) {
    window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }
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

initHeaderSkuSearch();
document.addEventListener('shopify:section:load', initHeaderSkuSearch);
