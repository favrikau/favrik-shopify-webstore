import { Component } from '@theme/component';

const STORAGE_KEY = 'favrik-email-popup-dismissed';

/**
 * Floating email marketing teaser + panel.
 * Not a modal: no focus trap, no full-screen overlay.
 *
 * @typedef {Object} EmailMarketingPopupRefs
 * @property {HTMLButtonElement} [teaser]
 * @property {HTMLElement} [panel]
 * @property {HTMLButtonElement} [closeButton]
 * @property {HTMLInputElement} [emailInput]
 * @property {HTMLElement} [success]
 *
 * @extends {Component<EmailMarketingPopupRefs>}
 */
class EmailMarketingPopupComponent extends Component {
  requiredRefs = ['teaser', 'panel', 'closeButton'];

  /** @type {number | undefined} */
  #appearTimeout;

  /** @type {boolean} */
  #editorPreview = false;

  connectedCallback() {
    super.connectedCallback();

    this.#bindEditorEvents();
    this.#bindTriggerClicks();

    if (window.Shopify?.designMode) {
      this.hidden = true;
      return;
    }

    const popupState = this.querySelector('[data-email-popup-state]');
    if (popupState) {
      // Keep the return page open so the shopper sees success/errors, but stop
      // the teaser reappearing on later navigations after a successful signup.
      if (popupState.getAttribute('data-email-popup-state') === 'success') {
        this.#persistDismissal();
      }

      this.#revealTeaser();
      this.openPanel({ focus: true });
      return;
    }

    if (this.#isDismissed()) {
      this.hidden = true;
      return;
    }

    this.#scheduleAppear();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#clearAppearTimeout();
    document.removeEventListener('keydown', this.#handleDocumentKeydown);
    document.removeEventListener('pointerdown', this.#handlePointerDownOutside, true);
    document.removeEventListener('click', this.#handleTriggerClick);
    document.removeEventListener('shopify:section:select', this.#handleSectionSelect);
    document.removeEventListener('shopify:section:deselect', this.#handleSectionDeselect);
  }

  /**
   * Toggles the panel from the teaser button.
   */
  togglePanel() {
    if (this.isOpen) {
      this.closePanel({ dismiss: false });
    } else {
      this.openPanel({ focus: true });
    }
  }

  /**
   * Opens from a persistent site link (e.g. footer), even after session dismissal.
   */
  openFromTrigger() {
    this.#clearAppearTimeout();
    this.#clearDismissal();
    this.openPanel({ focus: true });
  }

  /**
   * Opens the floating panel and moves focus into it.
   * @param {{ focus?: boolean }} [options]
   */
  openPanel({ focus = true } = {}) {
    const { panel, teaser, closeButton, emailInput, success } = this.refs;
    if (!panel || !teaser) return;

    this.#revealTeaser();

    panel.hidden = false;
    panel.setAttribute('data-open', 'true');
    this.#setExpanded(true);

    document.addEventListener('keydown', this.#handleDocumentKeydown);
    document.addEventListener('pointerdown', this.#handlePointerDownOutside, true);

    if (!focus) return;

    requestAnimationFrame(() => {
      if (success && !success.hidden) {
        success.focus();
        return;
      }

      if (emailInput instanceof HTMLInputElement) {
        emailInput.focus();
        return;
      }

      closeButton?.focus();
    });
  }

  /**
   * Closes the panel and returns focus to the teaser.
   * @param {{ dismiss?: boolean, returnFocus?: boolean }} [options]
   */
  closePanel({ dismiss = false, returnFocus = true } = {}) {
    const { panel, teaser } = this.refs;
    if (!panel || !teaser) return;

    const wasOpen = this.isOpen;

    panel.hidden = true;
    panel.removeAttribute('data-open');
    this.#setExpanded(false);

    document.removeEventListener('keydown', this.#handleDocumentKeydown);
    document.removeEventListener('pointerdown', this.#handlePointerDownOutside, true);

    if (wasOpen && returnFocus && !this.#editorPreview) {
      const activeTrigger = document.querySelector('[data-email-popup-trigger][data-email-popup-last-trigger="true"]');
      if (activeTrigger instanceof HTMLElement) {
        activeTrigger.focus({ preventScroll: true });
        activeTrigger.removeAttribute('data-email-popup-last-trigger');
      } else {
        teaser.focus({ preventScroll: true });
      }
    }

    if (dismiss && !window.Shopify?.designMode) {
      this.#dismissForSession();
    }
  }

  /**
   * Close button handler — dismisses for the rest of the session.
   */
  dismiss() {
    this.closePanel({ dismiss: true });
  }

  get isOpen() {
    return this.refs.panel?.getAttribute('data-open') === 'true';
  }

  #scheduleAppear() {
    const delayMs = Number.parseInt(this.dataset.delayMs ?? '0', 10);
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;

    this.hidden = true;

    this.#appearTimeout = window.setTimeout(() => {
      this.#revealTeaser();
    }, delay);
  }

  #revealTeaser() {
    this.hidden = false;
    this.setAttribute('data-visible', 'true');
  }

  #clearAppearTimeout() {
    if (this.#appearTimeout !== undefined) {
      window.clearTimeout(this.#appearTimeout);
      this.#appearTimeout = undefined;
    }
  }

  #isDismissed() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  #persistDismissal() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

  #clearDismissal() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

  #dismissForSession() {
    this.#persistDismissal();
    this.hidden = true;
    this.removeAttribute('data-visible');
  }

  /**
   * @param {boolean} expanded
   */
  #setExpanded(expanded) {
    this.refs.teaser?.setAttribute('aria-expanded', String(expanded));
    document.querySelectorAll('[data-email-popup-trigger]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', String(expanded));
    });
  }

  #bindTriggerClicks() {
    document.addEventListener('click', this.#handleTriggerClick);
  }

  #bindEditorEvents() {
    if (!window.Shopify?.designMode) return;

    document.addEventListener('shopify:section:select', this.#handleSectionSelect);
    document.addEventListener('shopify:section:deselect', this.#handleSectionDeselect);
  }

  /**
   * @param {MouseEvent} event
   */
  #handleTriggerClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest('[data-email-popup-trigger]');
    if (!(trigger instanceof HTMLElement)) return;

    // Ignore the built-in teaser; it uses the component click handler.
    if (trigger === this.refs.teaser || this.contains(trigger)) return;

    event.preventDefault();
    event.stopPropagation();

    document.querySelectorAll('[data-email-popup-trigger]').forEach((item) => {
      item.removeAttribute('data-email-popup-last-trigger');
    });
    trigger.setAttribute('data-email-popup-last-trigger', 'true');

    if (this.isOpen) {
      this.closePanel({ dismiss: false, returnFocus: true });
      return;
    }

    this.openFromTrigger();
  };

  /**
   * @param {Event} event
   */
  #handleSectionSelect = (event) => {
    const sectionId = this.dataset.sectionId;
    const detail = /** @type {CustomEvent & { detail?: { sectionId?: string } }} */ (event).detail;
    const selectedId = detail?.sectionId;
    const target = event.target;

    const matches =
      (sectionId && selectedId === sectionId) ||
      (target instanceof Element && (target === this || target.contains(this)));

    if (!matches) return;

    this.#editorPreview = true;
    this.#clearAppearTimeout();
    this.#revealTeaser();
    this.openPanel({ focus: false });
  };

  /**
   * @param {Event} event
   */
  #handleSectionDeselect = (event) => {
    const sectionId = this.dataset.sectionId;
    const detail = /** @type {CustomEvent & { detail?: { sectionId?: string } }} */ (event).detail;
    const selectedId = detail?.sectionId;
    const target = event.target;

    const matches =
      (sectionId && selectedId === sectionId) ||
      (target instanceof Element && (target === this || target.contains(this)));

    if (!matches) return;

    this.#editorPreview = false;
    this.closePanel({ dismiss: false });
    this.hidden = true;
    this.removeAttribute('data-visible');
  };

  /**
   * @param {KeyboardEvent} event
   */
  #handleDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (!this.isOpen) return;

    event.preventDefault();
    this.closePanel({ dismiss: false });
  };

  /**
   * @param {PointerEvent} event
   */
  #handlePointerDownOutside = (event) => {
    if (!this.isOpen) return;
    if (!(event.target instanceof Element)) return;
    if (this.contains(event.target)) return;
    // Footer / other triggers handle their own toggle on click.
    if (event.target.closest('[data-email-popup-trigger]')) return;

    this.closePanel({ dismiss: false });
  };
}

if (!customElements.get('email-marketing-popup-component')) {
  customElements.define('email-marketing-popup-component', EmailMarketingPopupComponent);
}
