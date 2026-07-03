import { Component } from '@theme/component';
import { onDocumentLoaded, changeMetaThemeColor, setHeaderMenuStyle } from '@theme/utilities';
import {
  getScrollTop,
  getScrollEventTarget,
  getIntersectionRoot,
  scrollContainerMediaQuery,
} from '@theme/scroll-container';

/**
 * @typedef {Object} HeaderComponentRefs
 * @property {HTMLDivElement} headerDrawerContainer - The header drawer container element
 * @property {HTMLElement} headerMenu - The header menu element
 * @property {HTMLElement} headerRowTop - The header top row element
 */

/**
 * @typedef {CustomEvent<{ minimumReached: boolean }>} OverflowMinimumEvent
 */

/**
 * Minimum scroll distance (px) required before re-evaluating scroll
 * direction/position. Filters out sub-pixel jitter (rubber-band bounce,
 * momentum settling, etc.) that would otherwise cause the header to flicker
 * rapidly between states when the user pauses scrolling right at a
 * state-change boundary.
 * @type {number}
 */
const SCROLL_DELTA_THRESHOLD = 4;

/**
 * Delay (ms) before committing a header state change (sticky-state or
 * scroll-direction) to the DOM. Smooths over spurious re-fires that can
 * happen when the header sits exactly at a state-change boundary, which
 * previously caused the header to flash rapidly between states.
 * @type {number}
 */
const STATE_SETTLE_MS = 70;

/**
 * Hysteresis buffer (px) used when deciding whether the header has scrolled
 * away from its natural "at top" position. Once away from the top, the
 * header must scroll back within this many pixels of 0 before being
 * considered "at top" again (and vice versa), so that hand-tremor-scale
 * movement hovering right at the boundary can't keep flipping the state.
 * @type {number}
 */
const TOP_HYSTERESIS_PX = 6;

/**
 * A custom element that manages the site header.
 *
 * @extends {Component<HeaderComponentRefs>}
 */

class HeaderComponent extends Component {
  requiredRefs = ['headerDrawerContainer', 'headerMenu', 'headerRowTop'];

  /**
   * Width of window when header drawer was hidden
   * @type {number | null}
   */
  #menuDrawerHiddenWidth = null;

  /**
   * An intersection observer for monitoring sticky header position
   * @type {IntersectionObserver | null}
   */
  #intersectionObserver = null;

  /** @type {EventTarget | null} */
  #scrollContainer = null;

  /**
   * Whether the header has been scrolled offscreen, when sticky behavior is 'scroll-up'
   * @type {boolean}
   */
  #offscreen = false;

  /**
   * The last recorded scrollTop of the document, when sticky behavior is 'scroll-up
   * @type {number}
   */
  #lastScrollTop = 0;

  /**
   * A timeout to allow for hiding animation, when sticky behavior is 'scroll-up'
   * @type {number | null}
   */
  #timeout = null;

  /**
   * RAF ID for scroll handler throttling
   * @type {number | null}
   */
  #scrollRafId = null;

  /**
   * Pending debounced dataset commits, keyed by dataset property name.
   * @type {Map<string, { value: string, timer: number }>}
   */
  #pendingCommits = new Map();

  /**
   * Hysteresis-tracked "at top" state, when sticky behavior is 'scroll-up' or 'always'
   * @type {boolean}
   */
  #isAtTop = true;

  /**
   * Keeps the global `--header-height` custom property up to date,
   * which other theme components can then consume
   */
  #resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry || !entry.borderBoxSize[0]) return;

    // The initial height is calculated using the .offsetHeight property, which returns an integer.
    // We round to the nearest integer to avoid unnecessaary reflows.
    const roundedHeaderHeight = Math.round(entry.borderBoxSize[0].blockSize);
    document.body.style.setProperty('--header-height', `${roundedHeaderHeight}px`);

    // Check if the menu drawer should be hidden in favor of the header menu
    if (this.#menuDrawerHiddenWidth && window.innerWidth > this.#menuDrawerHiddenWidth) {
      this.#updateMenuVisibility(false);
    }
  });

  /**
   * Debounces writes to a `dataset` property so that rapidly alternating
   * candidate values (caused by scroll/intersection noise right at a
   * state-change boundary) settle before ever reaching the DOM/CSS, instead
   * of visibly flashing between states.
   *
   * - If `nextValue` matches what's already committed, any pending flip away
   *   from it is cancelled (the noise reverted on its own).
   * - If `nextValue` matches what's already pending, the existing timer is
   *   left alone so continuous, consistent changes (e.g. an ordinary scroll)
   *   aren't perpetually deferred.
   * - Otherwise, the pending value is (re)scheduled to commit after
   *   `STATE_SETTLE_MS`.
   *
   * @param {string} key - The `dataset` property name to write
   * @param {string} nextValue - The candidate value for that property
   */
  #commitAttribute = (key, nextValue) => {
    const pending = this.#pendingCommits.get(key);

    if (nextValue === this.dataset[key]) {
      if (pending) {
        clearTimeout(pending.timer);
        this.#pendingCommits.delete(key);
      }
      return;
    }

    if (pending) {
      if (pending.value === nextValue) return;
      clearTimeout(pending.timer);
    }

    const timer = window.setTimeout(() => {
      this.#pendingCommits.delete(key);
      this.dataset[key] = nextValue;
      if (key === 'stickyState' && this.dataset.themeColor) changeMetaThemeColor(this.dataset.themeColor);
    }, STATE_SETTLE_MS);

    this.#pendingCommits.set(key, { value: nextValue, timer });
  };

  /**
   * Observes the header while scrolling the viewport to track when its actively sticky
   * @param {Boolean} alwaysSticky - Determines if we need to observe when the header is offscreen
   */
  #observeStickyPosition = (alwaysSticky = true) => {
    if (this.#intersectionObserver) return;

    const config = {
      threshold: alwaysSticky ? 1 : 0,
      root: getIntersectionRoot(),
    };

    this.#intersectionObserver = new IntersectionObserver(([entry]) => {
      if (!entry) return;

      const { isIntersecting } = entry;

      if (alwaysSticky) {
        this.#commitAttribute('stickyState', isIntersecting ? 'inactive' : 'active');
      } else {
        this.#offscreen = !isIntersecting || this.dataset.stickyState === 'active';
      }
    }, config);

    this.#intersectionObserver.observe(this);
  };

  /**
   * Handles the overflow minimum event from the header menu
   * @param {OverflowMinimumEvent} event
   */
  #handleOverflowMinimum = (event) => {
    this.#updateMenuVisibility(event.detail.minimumReached);
  };

  /**
   * Updates the visibility of the menu and drawer
   * @param {boolean} hideMenu - Whether to hide the menu and show the drawer
   */
  #updateMenuVisibility(hideMenu) {
    if (hideMenu) {
      this.#menuDrawerHiddenWidth = window.innerWidth;
    } else {
      this.#menuDrawerHiddenWidth = null;
      // The drawer squeeze can trigger minimum-reached at desktop widths where
      // it normally wouldn't. Once the menu hides, the overflow-list is
      // display:none and can't measure to clear it. Resetting it here so
      // setHeaderMenuStyle() sees a clean state.
      const overflowList = this.querySelector('overflow-list');
      if (overflowList) overflowList.removeAttribute('minimum-reached');
    }
    setHeaderMenuStyle();
  }

  /**
   * Rebinds the scroll listener and IntersectionObserver when the viewport
   * crosses the squeeze breakpoint (990px). The scroll container switches
   * between `.page-wrapper` (desktop) and `document.scrollingElement` (mobile),
   * so cached bindings from initialization become stale after a resize.
   */
  #handleBreakpointChange = () => {
    const stickyMode = this.getAttribute('sticky');
    if (!stickyMode) return;

    // Rebind scroll listener
    if (this.#scrollContainer) {
      this.#scrollContainer.removeEventListener('scroll', this.#handleWindowScroll);
      this.#scrollContainer = getScrollEventTarget();
      this.#scrollContainer.addEventListener('scroll', this.#handleWindowScroll);
    }

    // Recreate IntersectionObserver with the new root
    this.#intersectionObserver?.disconnect();
    this.#intersectionObserver = null;
    this.#observeStickyPosition(stickyMode === 'always');
  };

  #handleWindowScroll = () => {
    if (this.#scrollRafId !== null) return;

    this.#scrollRafId = requestAnimationFrame(() => {
      this.#scrollRafId = null;
      this.#updateScrollState();
    });
  };

  #handleCollectionHeaderExpand = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('[data-collection-header-expand]')) return;

    this.dataset.collectionHeaderExpanded = 'true';
    window.dispatchEvent(new CustomEvent('collection:header-expanded'));
  };

  #updateScrollState = () => {
    const stickyMode = this.getAttribute('sticky');
    if (!this.#offscreen && stickyMode !== 'always') return;

    const scrollTop = getScrollTop();
    const delta = scrollTop - this.#lastScrollTop;

    // Ignore sub-threshold movements (rubber-band bounce, momentum settling, etc).
    // Without this, pausing scroll right at a state-change boundary can cause the
    // sign of `delta` to flip every animation frame from noise alone, making the
    // header rapidly flash between its "up"/"down"/"none" states. Returning early
    // (without touching #lastScrollTop) keeps the previous state intact and lets
    // genuine scroll distance accumulate against the last committed position.
    if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) return;

    this.#lastScrollTop = scrollTop;

    const headerTop = this.getBoundingClientRect().top;
    const isScrollingUp = delta < 0;

    // Hysteresis: once the header has left its natural top position, require it
    // to scroll clearly back (>= 0) before being considered "at top" again, and
    // vice versa. Without this dead zone, tiny real movements that straddle the
    // exact 0px boundary (e.g. an unsteady hand paused mid-scroll) can toggle
    // `isAtTop` back and forth just as readily as noise can.
    const isAtTop = this.#isAtTop ? headerTop > -TOP_HYSTERESIS_PX : headerTop >= 0;
    this.#isAtTop = isAtTop;

    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }

    if (stickyMode === 'always') {
      if (isAtTop) {
        this.#commitAttribute('scrollDirection', 'none');
      } else if (isScrollingUp) {
        this.#commitAttribute('scrollDirection', 'up');
      } else {
        this.#commitAttribute('scrollDirection', 'down');
      }

      return;
    }

    if (isScrollingUp) {
      if (isAtTop) {
        // reset sticky state when header is scrolled up to natural position
        this.#offscreen = false;
        this.#commitAttribute('stickyState', 'inactive');
        this.#commitAttribute('scrollDirection', 'none');
      } else {
        // show sticky header when scrolling up
        this.#commitAttribute('stickyState', 'active');
        this.#commitAttribute('scrollDirection', 'up');
      }
    } else {
      this.#commitAttribute('scrollDirection', 'none');
      this.#commitAttribute('stickyState', 'idle');
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this.#resizeObserver.observe(this);
    this.addEventListener('overflowMinimum', this.#handleOverflowMinimum);
    this.addEventListener('click', this.#handleCollectionHeaderExpand);

    const stickyMode = this.getAttribute('sticky');
    if (stickyMode) {
      this.#observeStickyPosition(stickyMode === 'always');

      if (stickyMode === 'scroll-up' || stickyMode === 'always') {
        this.#scrollContainer = getScrollEventTarget();
        this.#scrollContainer.addEventListener('scroll', this.#handleWindowScroll);
      }

      scrollContainerMediaQuery.addEventListener('change', this.#handleBreakpointChange);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
    this.#intersectionObserver?.disconnect();
    this.removeEventListener('overflowMinimum', this.#handleOverflowMinimum);
    this.removeEventListener('click', this.#handleCollectionHeaderExpand);
    scrollContainerMediaQuery.removeEventListener('change', this.#handleBreakpointChange);
    this.#scrollContainer?.removeEventListener('scroll', this.#handleWindowScroll);
    this.#scrollContainer = null;
    if (this.#scrollRafId !== null) {
      cancelAnimationFrame(this.#scrollRafId);
      this.#scrollRafId = null;
    }
    for (const pending of this.#pendingCommits.values()) {
      clearTimeout(pending.timer);
    }
    this.#pendingCommits.clear();
    document.body.style.setProperty('--header-height', '0px');
  }
}

if (!customElements.get('header-component')) {
  customElements.define('header-component', HeaderComponent);
}

onDocumentLoaded(() => {
  const header = document.querySelector('header-component');
  const headerGroup = document.querySelector('#header-group');

  // Note: Initial header heights are set via inline script in theme.liquid
  // This ResizeObserver handles dynamic updates after page load

  // Update header group height on resize of any child
  if (headerGroup) {
    const resizeObserver = new ResizeObserver((entries) => {
      const headerGroupHeight = entries.reduce((totalHeight, entry) => {
        if (
          entry.target !== header ||
          (header.hasAttribute('transparent') && header.parentElement?.nextElementSibling)
        ) {
          return totalHeight + (entry.borderBoxSize[0]?.blockSize ?? 0);
        }
        return totalHeight;
      }, 0);
      // The initial height is calculated using the .offsetHeight property, which returns an integer.
      // We round to the nearest integer to avoid unnecessaary reflows.
      const roundedHeaderGroupHeight = Math.round(headerGroupHeight);
      document.body.style.setProperty('--header-group-height', `${roundedHeaderGroupHeight}px`);
    });

    if (header instanceof HTMLElement) {
      resizeObserver.observe(header);
    }

    // Observe all children of the header group
    const children = headerGroup.children;
    for (let i = 0; i < children.length; i++) {
      const element = children[i];
      if (element instanceof HTMLElement) {
        resizeObserver.observe(element);
      }
    }

    // Also observe the header group itself for child changes
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Re-observe all children when the list changes
          const children = headerGroup.children;
          for (let i = 0; i < children.length; i++) {
            const element = children[i];
            if (element instanceof HTMLElement) {
              resizeObserver.observe(element);
            }
          }
        }
      }
    });

    mutationObserver.observe(headerGroup, { childList: true });
  }
});
