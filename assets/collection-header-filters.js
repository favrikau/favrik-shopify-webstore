/**
 * Keeps collection-header Filter trigger aria-expanded in sync with #filters-drawer.
 */

const TRIGGER_SELECTOR = '[data-collection-filter-trigger]';
const DRAWER_ID = 'filters-drawer';

/**
 * @returns {HTMLElement | null}
 */
function getDrawer() {
  return document.getElementById(DRAWER_ID);
}

/**
 * @param {boolean} open
 */
function setTriggersExpanded(open) {
  document.querySelectorAll(TRIGGER_SELECTOR).forEach((trigger) => {
    trigger.setAttribute('aria-expanded', String(open));
  });
}

function bindDrawerEvents() {
  const drawer = getDrawer();
  if (!drawer || drawer.dataset.collectionFilterBound === 'true') return;

  drawer.dataset.collectionFilterBound = 'true';
  drawer.addEventListener('theme-drawer:open', () => setTriggersExpanded(true));
  drawer.addEventListener('theme-drawer:close', () => setTriggersExpanded(false));
  setTriggersExpanded(drawer.hasAttribute('open'));
}

bindDrawerEvents();
document.addEventListener('shopify:section:load', bindDrawerEvents);
