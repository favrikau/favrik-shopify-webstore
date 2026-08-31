import { Component } from '@theme/component';
import { StandardEvents, CartLinesUpdateEvent } from '@shopify/events';
import { DrawerOpenEvent, DrawerCloseEvent } from '@theme/theme-drawer';

/**
 * Header actions component that manages cart notifications and the
 * cart-drawer trigger's `aria-expanded` state.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} liveRegion - The live region for cart announcements.
 *
 * @extends {Component<Refs>}
 */
class HeaderActions extends Component {
  requiredRefs = ['liveRegion'];

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
    document.addEventListener(DrawerOpenEvent.eventName, this.#onDrawerStateChange);
    document.addEventListener(DrawerCloseEvent.eventName, this.#onDrawerStateChange);
    this.#syncCartTriggerAriaExpanded();
    this.#styleAccountCloseButton();
    customElements.whenDefined('shopify-account').then(() => this.#styleAccountCloseButton());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
    document.removeEventListener(DrawerOpenEvent.eventName, this.#onDrawerStateChange);
    document.removeEventListener(DrawerCloseEvent.eventName, this.#onDrawerStateChange);
  }

  /**
   * Shopify's account sheet close control (`.account__close`) has no CSS part,
   * so host styles cannot reach it. Inject a stylesheet into the open shadow root.
   */
  #styleAccountCloseButton = () => {
    this.querySelectorAll('shopify-account').forEach(styleShopifyAccountClose);
  };

  #syncCartTriggerAriaExpanded = () => {
    const cartDrawer = document.getElementById('cart-drawer');
    if (!cartDrawer) return;
    const trigger = this.querySelector('[aria-controls="cart-drawer"]');
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', cartDrawer.hasAttribute('open') ? 'true' : 'false');
  };

  /**
   * Syncs `aria-expanded` on the cart-drawer trigger when the drawer opens or closes.
   * @param {Event} event
   */
  #onDrawerStateChange = (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (target?.id !== 'cart-drawer') return;
    this.#syncCartTriggerAriaExpanded();
  };

  /**
   * Handles cart update events and announces the new count to screen readers.
   * @param {CartLinesUpdateEvent} event
   */
  #onCartUpdate = (event) => {
    event.promise
      ?.then(({ cart }) => {
        const cartCount = cart?.totalQuantity;
        if (cartCount === undefined) return;

        this.refs.liveRegion.textContent = `${Theme.translations.cart_count}: ${cartCount}`;
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[header-actions] Event promise rejected:', error);
      });
  };
}

const ACCOUNT_SHEET_STYLE_ID = 'favrik-account-sheet-style';
const ACCOUNT_SHEET_LINE = '0.5px';
const ACCOUNT_SHEET_CSS = `
  .account__close,
  .account__close.button.subdued {
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    filter: none !important;
    border: ${ACCOUNT_SHEET_LINE} solid rgb(48 33 24 / 0.35) !important;
    border-radius: 0 !important;
  }

  .account__close:hover,
  .account__close:active,
  .account__close:focus,
  .account__close:focus-visible,
  .account__close.button.subdued:hover {
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    filter: none !important;
  }

  .button.outline,
  .account__shortcuts,
  .login-form__email-input,
  .login-form__social-login-button {
    border-width: ${ACCOUNT_SHEET_LINE} !important;
  }

  .account__item-wrapper::before,
  .login-form__divider-line {
    height: ${ACCOUNT_SHEET_LINE} !important;
  }

  .login-form__marketing-consent-visual,
  .login-form__marketing-consent-checkbox:focus-visible +   .login-form__marketing-consent-visual {
    box-shadow: 0 0 0 ${ACCOUNT_SHEET_LINE} var(--shopify-login-form-color-border, var(--shopify-account-color-border)) inset !important;
  }

  .login-form__marketing-consent-checkbox:focus-visible + .login-form__marketing-consent-visual {
    box-shadow:
      0 0 0 ${ACCOUNT_SHEET_LINE} var(--shopify-login-form-color-border, var(--shopify-account-color-border)) inset,
      var(--shadow-focus-ring-accent) !important;
  }

  @media (max-width: 749px) {
    :host,
    * {
      font-size: 0.75rem !important;
    }

    input,
    textarea,
    select {
      font-size: 16px !important;
    }

    .account__close,
    .account__close.button.subdued,
    .account__close:is(:hover, :active, :focus, :focus-visible) {
      border: 0 !important;
      outline: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
    }
  }
`;

/** @type {WeakSet<Element>} */
const accountSheetStyled = new WeakSet();

/**
 * @param {ShadowRoot} root
 * @param {string} css
 */
function appendAccountSheetStyle(root, css) {
  if (!root || root.getElementById(ACCOUNT_SHEET_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ACCOUNT_SHEET_STYLE_ID;
  const nonceMeta = document.querySelector('meta[property="csp-nonce"]');
  const nonce = nonceMeta?.nonce || nonceMeta?.getAttribute('nonce');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = css;
  root.appendChild(style);
}

/**
 * @param {ShadowRoot | null} root
 * @param {(shadowRoot: ShadowRoot) => void} visit
 */
function walkOpenShadows(root, visit) {
  if (!root) return;
  visit(root);
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) walkOpenShadows(el.shadowRoot, visit);
  });
}

/**
 * @param {Element} account
 */
function injectAccountCloseStyle(account) {
  walkOpenShadows(account.shadowRoot, (root) => {
    appendAccountSheetStyle(root, ACCOUNT_SHEET_CSS);

    const host = root.host;
    if (host?.localName === 'shopify-login-form' && !host.hasAttribute('data-favrik-sheet-observed')) {
      host.setAttribute('data-favrik-sheet-observed', '');
      new MutationObserver(() => injectAccountCloseStyle(account)).observe(root, {
        childList: true,
        subtree: true,
      });
    }
  });
}

/**
 * Login form mounts after the sheet opens, in a nested shadow root.
 * @param {Element} account
 */
function scheduleAccountSheetStyle(account) {
  injectAccountCloseStyle(account);
  requestAnimationFrame(() => injectAccountCloseStyle(account));
  setTimeout(() => injectAccountCloseStyle(account), 50);
  setTimeout(() => injectAccountCloseStyle(account), 250);
}

/**
 * @param {Element} account
 */
function styleShopifyAccountClose(account) {
  scheduleAccountSheetStyle(account);

  if (accountSheetStyled.has(account)) return;
  accountSheetStyled.add(account);
  account.addEventListener('toggle', () => scheduleAccountSheetStyle(account), true);
  account.addEventListener('open', () => scheduleAccountSheetStyle(account));

  if (account.shadowRoot) {
    new MutationObserver(() => injectAccountCloseStyle(account)).observe(account.shadowRoot, {
      childList: true,
      subtree: true,
    });
  }

  customElements.whenDefined('shopify-login-form').then(() => scheduleAccountSheetStyle(account));
}

if (!customElements.get('header-actions')) {
  customElements.define('header-actions', HeaderActions);
}
