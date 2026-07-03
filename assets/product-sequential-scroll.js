const DESKTOP_QUERY = '(min-width: 750px)';

/**
 * Maps page scroll through the product hero into sequential column scrolling:
 * gallery first, then product details, then the rest of the page.
 */
class ProductSequentialScroll {
  /** @type {HTMLElement | null} */
  #root = null;

  /** @type {HTMLElement | null} */
  #scrollTrack = null;

  /** @type {HTMLElement | null} */
  #scrollStage = null;

  /** @type {HTMLElement | null} */
  #mediaScroll = null;

  /** @type {HTMLElement | null} */
  #detailsScroll = null;

  /** @type {HTMLElement | null} */
  #mediaInner = null;

  /** @type {HTMLElement | null} */
  #detailsInner = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  /** @type {number} */
  #trackTop = 0;

  /** @type {number} */
  #stageHeight = 0;

  /** @type {number} */
  #maxMediaScroll = 0;

  /** @type {number} */
  #maxDetailsScroll = 0;

  /** @type {boolean} */
  #enabled = false;

  /** @type {number | null} */
  #raf = null;

  constructor(root) {
    this.#root = root;
  }

  connect() {
    if (!this.#shouldEnable()) return;

    this.#scrollTrack = this.#root.querySelector('.product-information__scroll-track');
    this.#scrollStage = this.#root.querySelector('.product-information__scroll-stage');
    this.#mediaScroll = this.#root.querySelector('.product-information__media-scroll');
    this.#detailsScroll = this.#root.querySelector('.product-information__details-scroll');
    this.#mediaInner = this.#root.querySelector('.product-information__media-inner');
    this.#detailsInner = this.#root.querySelector('.product-information__details-inner');

    if (
      !this.#scrollTrack ||
      !this.#scrollStage ||
      !this.#mediaScroll ||
      !this.#detailsScroll ||
      !this.#mediaInner ||
      !this.#detailsInner
    ) {
      return;
    }

    this.#enabled = true;
    this.#observeSizeChanges();
    window.addEventListener('scroll', this.#requestSync, { passive: true });
    window.addEventListener('resize', this.#requestMeasure);

    this.#measure();
    this.#syncFromPageScroll();
  }

  disconnect() {
    this.#enabled = false;
    if (this.#raf !== null) {
      cancelAnimationFrame(this.#raf);
      this.#raf = null;
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    window.removeEventListener('scroll', this.#requestSync);
    window.removeEventListener('resize', this.#requestMeasure);
  }

  #shouldEnable() {
    if (!this.#root) return false;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return false;
    if (!this.#root.classList.contains('product-information--sequential-scroll')) return false;
    if (this.#root.classList.contains('product-information--media-none')) return false;
    return true;
  }

  #requestSync = () => {
    if (this.#raf !== null) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = null;
      this.#syncFromPageScroll();
    });
  };

  #requestMeasure = () => {
    if (this.#raf !== null) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = null;
      this.#measure();
      this.#syncFromPageScroll();
    });
  };

  #observeSizeChanges() {
    if (!this.#mediaInner || !this.#detailsInner) return;

    this.#resizeObserver = new ResizeObserver(this.#requestMeasure);

    this.#resizeObserver.observe(this.#mediaInner);
    this.#resizeObserver.observe(this.#detailsInner);
    this.#mediaInner.querySelectorAll('img').forEach((image) => {
      if (!(image instanceof HTMLImageElement)) return;
      if (image.complete) return;
      image.addEventListener('load', this.#requestMeasure, { once: true });
    });
  }

  #measure() {
    if (!this.#enabled || !this.#scrollTrack || !this.#scrollStage || !this.#mediaInner || !this.#detailsInner) {
      return;
    }

    this.#stageHeight = this.#scrollStage.clientHeight;
    this.#maxMediaScroll = Math.max(0, this.#mediaInner.scrollHeight - this.#stageHeight);
    this.#maxDetailsScroll = Math.max(0, this.#detailsInner.scrollHeight - this.#stageHeight);

    const trackRect = this.#scrollTrack.getBoundingClientRect();
    this.#trackTop = window.scrollY + trackRect.top;

    this.#scrollTrack.style.height = `${this.#stageHeight + this.#maxMediaScroll + this.#maxDetailsScroll}px`;
  }

  #syncFromPageScroll() {
    if (!this.#enabled || !this.#scrollStage || !this.#mediaInner || !this.#detailsInner) return;

    if (this.#scrollStage.clientHeight !== this.#stageHeight) {
      this.#measure();
    }

    const totalInternalScroll = this.#maxMediaScroll + this.#maxDetailsScroll;
    let progress = window.scrollY - this.#trackTop;
    progress = Math.max(0, Math.min(progress, totalInternalScroll));

    if (progress <= this.#maxMediaScroll) {
      this.#mediaInner.style.transform = `translateY(${-progress}px)`;
      this.#detailsInner.style.transform = 'translateY(0)';
      return;
    }

    this.#mediaInner.style.transform = `translateY(${-this.#maxMediaScroll}px)`;
    this.#detailsInner.style.transform = `translateY(${-(progress - this.#maxMediaScroll)}px)`;
  }
}

/** @type {Map<HTMLElement, ProductSequentialScroll>} */
const controllers = new Map();

function initProductSequentialScroll() {
  document.querySelectorAll('product-component.product-information--sequential-scroll').forEach((root) => {
    if (!(root instanceof HTMLElement)) return;
    if (controllers.has(root)) return;

    const controller = new ProductSequentialScroll(root);
    controllers.set(root, controller);
    controller.connect();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProductSequentialScroll, { once: true });
} else {
  initProductSequentialScroll();
}

document.addEventListener('shopify:section:load', initProductSequentialScroll);
document.addEventListener('shopify:section:unload', (event) => {
  const section = event.target;
  if (!(section instanceof HTMLElement)) return;

  section.querySelectorAll('product-component.product-information--sequential-scroll').forEach((root) => {
    if (!(root instanceof HTMLElement)) return;
    controllers.get(root)?.disconnect();
    controllers.delete(root);
  });
});
