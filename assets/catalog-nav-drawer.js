import { lockScroll, unlockScroll } from '@theme/utilities';

/**
 * Catalog navigation overlay.
 * Catalog clicks only open/close a blur overlay with category links — no page navigation.
 */

/** @type {boolean} */
let initialized = false;

/** @type {number | null} */
let closeTimer = null;

/** @type {ResizeObserver | null} */
let headerStackObserver = null;

const FADE_MS = 320;

/**
 * @returns {HTMLElement | null}
 */
function getDrawer() {
  return document.querySelector('[data-catalog-nav-drawer]');
}

/**
 * @returns {HTMLElement | null}
 */
function getBackdrop() {
  return document.querySelector('[data-catalog-nav-backdrop]');
}

/**
 * Full sticky chrome (delivery banner + header) bottom edge in the viewport.
 * Overlays must clear this — `--header-height` alone misses the product banner.
 * @returns {number}
 */
function getHeaderStackBottom() {
  const headerSection = document.querySelector('.header-section');
  if (headerSection instanceof HTMLElement) {
    return Math.max(0, Math.round(headerSection.getBoundingClientRect().bottom));
  }

  const fallback = Number.parseFloat(
    getComputedStyle(document.body).getPropertyValue('--header-height')
  );
  return Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0;
}

/**
 * Keep overlay pinned under the sticky header stack (banner + bar).
 */
function syncOverlayTop() {
  const top = getHeaderStackBottom();
  document.body.style.setProperty('--catalog-nav-top', `${top}px`);
}

/**
 * @returns {boolean}
 */
function isOpen() {
  return Boolean(getDrawer()?.classList.contains('is-open'));
}

/**
 * @param {boolean} open
 */
function setOpen(open) {
  const drawer = getDrawer();
  const backdrop = getBackdrop();
  if (!drawer) return;

  if (closeTimer != null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  document.querySelectorAll('[data-catalog-nav-trigger]').forEach((trigger) => {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  if (open) {
    document.dispatchEvent(new CustomEvent('catalog-nav:open'));
    closeSearchModal();
    syncOverlayTop();
    observeHeaderStack(true);

    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    lockScroll(drawer);
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute('aria-hidden', 'false');
    }

    // Force a frame so the browser applies opacity: 0 before fading in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        drawer.classList.add('is-open');
        backdrop?.classList.add('is-visible');
      });
    });
    return;
  }

  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop?.classList.remove('is-visible');
  backdrop?.setAttribute('aria-hidden', 'true');
  observeHeaderStack(false);
  unlockScroll(drawer);

  closeTimer = window.setTimeout(() => {
    drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    closeTimer = null;
  }, FADE_MS);
}

/**
 * @param {boolean} enabled
 */
function observeHeaderStack(enabled) {
  const headerSection = document.querySelector('.header-section');

  if (!enabled) {
    headerStackObserver?.disconnect();
    headerStackObserver = null;
    window.removeEventListener('resize', syncOverlayTop);
    window.removeEventListener('scroll', syncOverlayTop, true);
    return;
  }

  if (!headerStackObserver && headerSection instanceof HTMLElement) {
    headerStackObserver = new ResizeObserver(() => syncOverlayTop());
    headerStackObserver.observe(headerSection);
  }

  window.addEventListener('resize', syncOverlayTop);
  window.addEventListener('scroll', syncOverlayTop, true);
}

function closeSearchModal() {
  const searchModal = document.getElementById('search-modal');
  if (searchModal && typeof searchModal.closeDialog === 'function') {
    searchModal.closeDialog();
  }
}

function openDrawer() {
  setOpen(true);
}

function closeDrawer() {
  setOpen(false);
}

function toggleDrawer() {
  setOpen(!isOpen());
}

/**
 * @param {MouseEvent} event
 */
function handleDocumentClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const closeBtn = target.closest('[data-catalog-nav-close], [data-catalog-nav-backdrop]');
  if (closeBtn) {
    event.preventDefault();
    closeDrawer();
    return;
  }

  // Category links inside the overlay navigate normally.
  if (target.closest('.catalog-nav-drawer__link')) return;

  const trigger = target.closest('[data-catalog-nav-trigger]');
  if (!trigger) return;

  event.preventDefault();
  event.stopPropagation();
  toggleDrawer();
}

/**
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
  if (event.key === 'Escape' && isOpen()) closeDrawer();
}

function init() {
  if (initialized || !getDrawer()) return;
  initialized = true;

  syncOverlayTop();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('header-sku-search:open', () => {
    if (isOpen()) closeDrawer();
  });

  const searchModal = document.getElementById('search-modal');
  searchModal?.addEventListener('dialog:open', () => {
    if (isOpen()) closeDrawer();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

document.addEventListener('shopify:section:load', init);

export { openDrawer, closeDrawer, toggleDrawer };
