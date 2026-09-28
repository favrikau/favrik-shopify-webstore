import { CartLinesUpdateEvent, CartErrorEvent } from '@shopify/events';

/**
 * Shop Social look modal. Each tile ([data-shop-social-tile]) is followed by a
 * <template data-shop-social-look> containing [data-look-media] and [data-look-content],
 * which are cloned into the dialog when the tile is clicked.
 */
class ShopSocialModal extends HTMLElement {
  /** @type {HTMLDialogElement | null} */
  dialog = null;
  /** @type {HTMLElement[]} */
  tiles = [];
  index = 0;
  /** @type {HTMLElement | null} */
  opener = null;

  connectedCallback() {
    this.section = this.closest('.shop-social-section') ?? this.parentElement;
    this.dialog = this.querySelector('[data-shop-social-dialog]');
    this.mediaSlot = this.querySelector('[data-modal-media]');
    this.contentSlot = this.querySelector('[data-modal-content]');
    if (!this.section || !this.dialog || !this.mediaSlot || !this.contentSlot) return;

    this.section.addEventListener('click', this.onSectionClick);
    this.dialog.addEventListener('click', this.onDialogClick);
    this.dialog.addEventListener('close', this.onClose);
    this.dialog.addEventListener('keydown', this.onKeydown);
    this.dialog.addEventListener('submit', this.onSubmit);
  }

  disconnectedCallback() {
    this.section?.removeEventListener('click', this.onSectionClick);
    this.dialog?.removeEventListener('click', this.onDialogClick);
    this.dialog?.removeEventListener('close', this.onClose);
    this.dialog?.removeEventListener('keydown', this.onKeydown);
    this.dialog?.removeEventListener('submit', this.onSubmit);
  }

  /** @param {MouseEvent} event */
  onSectionClick = (event) => {
    const tile = event.target instanceof Element ? event.target.closest('[data-shop-social-tile]') : null;
    if (!(tile instanceof HTMLElement)) return;

    this.tiles = [...this.section.querySelectorAll('[data-shop-social-tile]')];
    this.opener = tile;
    this.show(this.tiles.indexOf(tile));

    if (!this.dialog.open) {
      this.dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    }
  };

  /** @param {MouseEvent} event */
  onDialogClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target === this.dialog || target.closest('[data-modal-close]')) {
      this.dialog.close();
    } else if (target.closest('[data-modal-prev]')) {
      this.show(this.index - 1);
    } else if (target.closest('[data-modal-next]')) {
      this.show(this.index + 1);
    }
  };

  /** @param {KeyboardEvent} event */
  onKeydown = (event) => {
    if (event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowLeft') this.show(this.index - 1);
    if (event.key === 'ArrowRight') this.show(this.index + 1);
  };

  onClose = () => {
    document.documentElement.style.overflow = '';
    this.mediaSlot.replaceChildren();
    this.contentSlot.replaceChildren();
    this.opener?.focus({ preventScroll: true });
  };

  /** @param {number} index */
  show(index) {
    if (!this.tiles.length) return;
    this.index = (index + this.tiles.length) % this.tiles.length;

    const template = this.tiles[this.index].nextElementSibling;
    if (!(template instanceof HTMLTemplateElement)) return;

    const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    const media = fragment.querySelector('[data-look-media]');
    const content = fragment.querySelector('[data-look-content]');

    this.mediaSlot.replaceChildren(...(media ? [media] : []));
    this.contentSlot.replaceChildren(...(content ? [content] : []));
    this.contentSlot.scrollTop = 0;
  }

  /** @param {SubmitEvent} event */
  onSubmit = async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-shop-social-add]')) return;
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const variantId = new FormData(form).get('id');
    if (!variantId || button?.getAttribute('aria-busy') === 'true') return;

    button?.setAttribute('aria-busy', 'true');
    form.querySelector('.shop-social-look__error')?.remove();

    try {
      await this.addToCart(form, String(variantId));

      // The cart drawer only opens after this modal closes; without auto-open, stay put and confirm inline.
      if (document.querySelector('cart-drawer-component[auto-open]')) {
        this.dialog.close();
      } else {
        this.showAdded(button);
      }
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'shop-social-look__error';
      message.setAttribute('role', 'alert');
      message.textContent = error instanceof Error ? error.message : 'Could not add to cart';
      form.append(message);
    } finally {
      button?.removeAttribute('aria-busy');
    }
  };

  /** @param {Element | null} button */
  showAdded(button) {
    const label = button?.querySelector('[data-add-label]');
    if (!label) return;

    label.textContent = 'Added';
    setTimeout(() => {
      label.textContent = 'Add to cart';
    }, 2000);
  }

  /**
   * Mirrors product-form.js so the cart drawer and cart count update the same way.
   * @param {HTMLElement} source
   * @param {string} variantId
   */
  async addToCart(source, variantId) {
    const sectionIds = [...document.querySelectorAll('cart-items-component')]
      .map((element) => (element instanceof HTMLElement ? element.dataset.sectionId : ''))
      .filter(Boolean);

    const deferred = CartLinesUpdateEvent.createPromise();
    source.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: [{ merchandiseId: variantId, quantity: 1 }],
        promise: deferred.promise,
      })
    );

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }], sections: sectionIds.join(',') }),
      }).then((res) => res.json());

      const ajaxCart = await this.fetchCart();

      if (response.status) {
        source.dispatchEvent(
          new CartErrorEvent({
            error: response.message || 'Add to cart failed',
            code: 'INVALID',
            detail: { description: response.description, errors: response.errors },
          })
        );
        deferred.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
          detail: { didError: true, items: ajaxCart.items, source: 'shop-social-modal', itemCount: 1 },
        });
        throw new Error(response.description || response.message || 'Could not add to cart');
      }

      deferred.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
        detail: {
          didError: false,
          items: ajaxCart.items,
          source: 'shop-social-modal',
          itemCount: 1,
          sections: response.sections,
        },
      });
    } catch (error) {
      deferred.reject(error);
      throw error;
    }
  }

  async fetchCart() {
    const cartItems = document.querySelector('cart-items-component');
    if (cartItems) {
      await customElements.whenDefined('cart-items-component');
      return /** @type {any} */ (cartItems).fetchCartData();
    }
    return fetch(`${Theme.routes.cart_url}.json`, { headers: { Accept: 'application/json' } }).then((res) =>
      res.json()
    );
  }
}

if (!customElements.get('shop-social-modal')) {
  customElements.define('shop-social-modal', ShopSocialModal);
}
