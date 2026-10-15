import { Component } from '@theme/component';
import {
  center,
  closest,
  clamp,
  mediaQueryLarge,
  prefersReducedMotion,
  viewTransition,
  scheduler,
} from '@theme/utilities';
import { Scroller, scrollIntoView } from '@theme/scrolling';
import { SlideshowSelectEvent } from '@theme/events';

// The threshold for determining visibility of slides.
const SLIDE_VISIBLITY_THRESHOLD = 0.7;

/**
 * Shared viewport observer manager for lazy scroll enablement.
 *
 * Limit the number of compositor layers created by slideshows by only enabling scrolling when the slideshow is in the viewport.
 * Resolves known issues with iOS Safari where too many composition layers will crash the page.
 * When a slideshow is NOT in the viewport, it has overflow: hidden (no compositor layer).
 * When a slideshow enters the viewport, the [in-viewport] attribute is added, enabling scrolling.
 */
class SlideshowViewportObserver {
  /** @type {SlideshowViewportObserver | null} */
  static #instance = null;

  /** @type {IntersectionObserver | null} */
  #observer = null;

  /**
   * Gets the singleton instance
   * @returns {SlideshowViewportObserver}
   */
  static getInstance() {
    if (!this.#instance) {
      this.#instance = new SlideshowViewportObserver();
    }
    return this.#instance;
  }

  /**
   * Registers a slideshow to be observed for viewport visibility
   * @param {Slideshow} slideshow - The slideshow to observe
   */
  observe(slideshow) {
    if (!this.#observer) {
      this.#observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const slideshowElement = /** @type {Slideshow} */ (entry.target);
            if (entry.isIntersecting) {
              slideshowElement.setAttribute('in-viewport', '');
            } else {
              slideshowElement.removeAttribute('in-viewport');
            }
          }
        },
        {
          rootMargin: '100px',
        }
      );
    }

    this.#observer.observe(slideshow);
  }

  /**
   * Unregisters a slideshow from viewport observation
   * @param {Slideshow} slideshow - The slideshow to unobserve
   */
  unobserve(slideshow) {
    this.#observer?.unobserve(slideshow);
    slideshow.removeAttribute('in-viewport');
  }
}

/**
 * Slideshow custom element that allows sliding between content.
 *
 * @typedef {Object} Refs
 * @property {HTMLElement} scroller
 * @property {HTMLElement} slideshowContainer
 * @property {HTMLElement[]} [slides]
 * @property {HTMLElement} [current]
 * @property {HTMLElement[]} [thumbnails]
 * @property {HTMLElement[]} [dots]
 * @property {HTMLButtonElement} [previous]
 * @property {HTMLButtonElement} [next]
 *
 * @extends {Component<Refs>}
 */
export class Slideshow extends Component {
  static get observedAttributes() {
    return ['initial-slide'];
  }

  /**
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    // Collection page filtering will Morph slideshow galleries in place, updating
    // the slideshow[initial-slide] and slideshow-slide[hidden] attributes.
    // We need to re-select() the slide after the morph is complete, but not before
    // slideshow-slide elements have their [hidden] attribute updated.
    if (name === 'initial-slide' && oldValue !== newValue) {
      queueMicrotask(() => {
        // Only select if the component is connected and initialized
        if (!this.isConnected || !this.#scroll || !this.refs.slides) return;
        const index = parseInt(newValue, 10) || 0;
        const slide_id = this.refs.slides[index]?.getAttribute('slide-id');
        if (slide_id) {
          this.select({ id: slide_id }, undefined, { animate: false });
        }
      });
    }
  }

  requiredRefs = ['scroller'];

  async connectedCallback() {
    super.connectedCallback();

    // Register with shared viewport observer for lazy scroll enablement.
    // This prevents iOS Safari crashes caused by too many compositor layers.
    SlideshowViewportObserver.getInstance().observe(this);

    // Wait for any in-progress view transitions to finish
    if (viewTransition.current) {
      await viewTransition.current;
      // It's possible that the slideshow was disconnected before the view transition finished
      if (!this.isConnected) return;
    }

    const slideCount = this.slides?.length || 0;
    slideCount <= 1 ? this.#setupSlideshowWithoutControls() : this.#setupSlideshow();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Unregister from shared viewport observer
    SlideshowViewportObserver.getInstance().unobserve(this);

    if (this.#scroll) {
      const { scroller } = this.refs;
      scroller.removeEventListener('mousedown', this.#handleMouseDown);
      scroller.removeEventListener('pointerdown', this.#handleTouchDrag);
      scroller.removeEventListener('pointerdown', this.#onMobileCardStart);
      scroller.removeEventListener('touchstart', this.#onMobileCardStart);
      scroller.removeEventListener('scroll', this.#updateMobileCardProgress);
      this.removeEventListener('click', this.#guardMobileCardSwipeClick, true);
      this.#unbindMobileCardSwipe();
      this.#cancelMobileCardAnim();
      this.#clearMobileCardClickBlock();
      this.#unlockPageScroll();
      this.#mobileCardGesture = false;
      this.#scroll.destroy();
    }

    mediaQueryLarge.removeEventListener('change', this.#syncMobileCardSwipe);

    const slideCount = this.slides?.length || 0;
    if (slideCount > 1) {
      this.removeEventListener('mouseenter', this.suspend);
      this.removeEventListener('mouseleave', this.resume);
      this.removeEventListener('pointerenter', this.#handlePointerEnter);
      document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    }

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
    }

    if (this.#intersectionObserver) {
      this.#intersectionObserver.disconnect();
      this.#intersectionObserver = null;
    }
  }

  /** Indicates whether the slideshow is nested inside another slideshow. */
  get isNested() {
    return this.parentElement?.closest('slideshow-component') !== null;
  }

  get initialSlide() {
    return this.refs.slides?.[this.initialSlideIndex];
  }

  /**
   * Selects a slide based on the input index.
   * @param {number|string|{id: string}} input - The index or id of the slide to select.
   * @param {Event} [event] - The event that triggered the selection.
   * @param {Object} [options] - The options for the selection.
   * @param {boolean} [options.animate=true] - Whether to animate the selection.
   */
  async select(input, event, options = {}) {
    if (this.#disabled || !this.refs.slides?.length) return;
    if (!this.#scroll) return;

    // Store the actual current slide before any mutations
    const currentSlide = this.slides?.[this.current];

    for (const slide of this.refs.slides) {
      if (slide.hasAttribute('reveal')) {
        slide.removeAttribute('reveal');
        slide.setAttribute('aria-hidden', 'true');
      }
    }

    // Figure out the raw desired index (could be -1 if user is on first slide and clicks prev)
    let requestedIndex = (() => {
      if (typeof input === 'number') return input;
      if (typeof input === 'string') return parseInt(input, 10);
      if ('id' in input) {
        const requestedSlide = this.refs.slides.find((slide) => slide.getAttribute('slide-id') == input.id);

        if (!requestedSlide || !this.slides) return;

        // Force the slide to be revealed if it is hidden
        if (requestedSlide.hasAttribute('hidden')) {
          requestedSlide.setAttribute('reveal', '');
          requestedSlide.setAttribute('aria-hidden', 'false');
        }

        return this.slides.indexOf(requestedSlide);
      }
    })();

    const { current } = this;
    const { slides } = this;

    // Guard checks: no slides, invalid index, or selecting the same slide
    if (!slides?.length || requestedIndex === undefined || isNaN(requestedIndex)) return;

    const requestedSlideElement = slides?.[requestedIndex];
    if (currentSlide === requestedSlideElement) return;

    if (!this.infinite) requestedIndex = clamp(requestedIndex, 0, slides.length - 1);

    event?.preventDefault();

    const { animate = true } = options;
    const lastIndex = slides.length - 1;

    // Decide the actual target index (clamp for infinite loop)
    let index = requestedIndex;
    if (requestedIndex < 0) index = lastIndex;
    else if (requestedIndex > lastIndex) index = 0;

    const isAdjacentSlide = Math.abs(index - current) <= 1 && requestedIndex >= 0 && requestedIndex <= lastIndex;
    const { visibleSlides } = this;
    const instant = prefersReducedMotion() || !animate;

    if (this.hasAttribute('data-fade-slides')) {
      const slide = slides[index];
      if (!slide) return;

      const previousIndex = this.current;

      if (!prefersReducedMotion()) {
        this.setAttribute('transitioning', '');
      }

      slides.forEach((slideshowSlide, slideIndex) => {
        slideshowSlide.setAttribute('aria-hidden', `${slideIndex !== index}`);
      });

      if (this.#scroll) {
        this.#scroll.to(slide, { instant: true });
      }

      this.current = index;

      this.#centerSelectedThumbnail(index, 'instant');

      this.dispatchEvent(
        new SlideshowSelectEvent({
          index,
          previousIndex,
          userInitiated: event != null,
          trigger: 'select',
          slide,
          id: slide.getAttribute('slide-id'),
        })
      );

      if (!prefersReducedMotion()) {
        setTimeout(() => this.removeAttribute('transitioning'), 220);
      }

      return;
    }

    // If jump is more than 1 or we looped, do the placeholder + reorder trick
    if (!instant && !isAdjacentSlide && visibleSlides.length === 1) {
      this.#disabled = true;
      await this.#scroll.finished; // ensure we're not mid-scroll

      const targetSlide = slides[index];
      if (!targetSlide || !currentSlide) return;

      // Create a placeholder in the original DOM position of targetSlide
      const placeholder = document.createElement('slideshow-slide');
      targetSlide.before(placeholder);

      // Decide whether targetSlide goes before or after currentSlide
      // so that we scroll a short distance in the correct direction
      if (requestedIndex < current) {
        currentSlide.before(targetSlide);
      } else {
        currentSlide.after(targetSlide);
      }

      if (current === 0) this.#scroll.to(currentSlide, { instant: true });

      // Once that scroll finishes, restore the DOM
      queueMicrotask(async () => {
        await this.#scroll.finished;
        this.#disabled = false;

        // Restore the slide back to its original position. This triggers a scroll event.
        placeholder.replaceWith(targetSlide);

        // Instantly scroll to the target slide as its position will have changed
        this.#scroll.to(targetSlide, { instant: true });

        // Force Safari to recalculate the timeline state on timeline refresh (after loop)
        requestAnimationFrame(() => {
          this.setAttribute('refreshing-timeline', '');
          requestAnimationFrame(() => {
            this.removeAttribute('refreshing-timeline');
          });
        });
      });
    }

    const slide = slides[index];
    if (!slide) return;

    const previousIndex = this.current;

    slide.setAttribute('aria-hidden', 'false');

    if (this.#scroll) {
      this.#scroll.to(slide, { instant });
    }

    this.current = this.slides?.indexOf(slide) || 0;

    this.#centerSelectedThumbnail(index, instant ? 'instant' : 'smooth');

    this.dispatchEvent(
      new SlideshowSelectEvent({
        index,
        previousIndex,
        userInitiated: event != null,
        trigger: 'select',
        slide,
        id: slide.getAttribute('slide-id'),
      })
    );
  }

  /**
   * Advances to the next slide.
   * @param {Event} [event] - The event that triggered the next slide.
   * @param {Object} [options] - The options for the next slide.
   * @param {boolean} [options.animate=true] - Whether to animate the next slide.
   */
  next(event, options) {
    event?.preventDefault();
    this.select(this.nextIndex, event, options);
  }

  /**
   * Goes back to the previous slide.
   * @param {Event} [event] - The event that triggered the previous slide.
   * @param {Object} [options] - The options for the previous slide.
   * @param {boolean} [options.animate=true] - Whether to animate the previous slide.
   */
  previous(event, options) {
    event?.preventDefault();
    this.select(this.previousIndex, event, options);
  }

  /**
   * Starts automatic slide playback.
   * @param {number} [interval] - The time interval in seconds between slides.
   */
  play(interval = this.autoplayInterval) {
    if (this.#interval) return;

    this.paused = false;

    this.#interval = setInterval(() => {
      if (this.matches(':hover') || document.hidden) return;

      this.next();
    }, interval);
  }

  /**
   * Pauses automatic slide playback.
   */
  pause() {
    this.paused = true;
    this.suspend();
  }

  get paused() {
    return this.hasAttribute('paused');
  }

  set paused(value) {
    if (value) {
      this.setAttribute('paused', '');
    } else {
      this.removeAttribute('paused');
    }
  }

  /**
   * Suspends automatic slide playback.
   */
  suspend() {
    clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /**
   * Resumes automatic slide playback if autoplay is enabled.
   */
  resume() {
    if (!this.autoplay || this.paused) return;

    this.pause();
    this.play();
  }

  get autoplay() {
    return Boolean(this.autoplayInterval);
  }

  get autoplayInterval() {
    const interval = this.getAttribute('autoplay');
    const value = parseInt(`${interval}`, 10);

    if (Number.isNaN(value)) return undefined;

    return value * 1000;
  }

  /**
   * The current slide index.
   * @type {number}
   */
  #current = 0;

  get current() {
    return this.#current;
  }

  /**
   * Sets the current slide index and update the DOM
   * @type {number}
   */
  set current(value) {
    const { current, thumbnails, dots, slides, previous, next } = this.refs;

    this.#current = value;

    if (current) current.textContent = `${value + 1}`;

    for (const controls of [thumbnails, dots]) {
      controls?.forEach((el, i) => el.setAttribute('aria-selected', `${i === value}`));
    }

    if (previous) previous.disabled = Boolean(!this.infinite && value === 0);
    if (next) next.disabled = Boolean(!this.infinite && slides && this.nextIndex >= slides.length);
  }

  get infinite() {
    return this.getAttribute('infinite') != null;
  }

  get visibleSlides() {
    return this.#visibleSlides;
  }

  get previousIndex() {
    const { current, visibleSlides } = this;
    const modifier = this.hasAttribute('data-fade-slides') ? 1 : visibleSlides.length > 1 ? visibleSlides.length : 1;

    return current - modifier;
  }

  get nextIndex() {
    const { current, visibleSlides } = this;
    const modifier = this.hasAttribute('data-fade-slides') ? 1 : visibleSlides.length > 1 ? visibleSlides.length : 1;

    return current + modifier;
  }

  get atStart() {
    const { current, slides } = this;

    return slides?.length ? current === 0 : false;
  }

  get atEnd() {
    const { current, slides } = this;

    return slides?.length ? current === slides.length - 1 : false;
  }

  /**
   * Number of slides advanced by a mouse drag. Touch scrolling uses the same
   * page boundaries through CSS scroll snap.
   */
  get pageSize() {
    const attribute = mediaQueryLarge.matches ? 'data-page-size-desktop' : 'data-page-size-mobile';
    const value = Number.parseInt(this.getAttribute(attribute) ?? '1', 10);

    return Number.isFinite(value) ? Math.max(1, value) : 1;
  }

  /**
   * Sets the disabled attribute.
   * @param {boolean} value - The value to set the disabled attribute to.
   */
  set disabled(value) {
    this.setAttribute('disabled', String(value));
  }
  /**
   * Whether the slideshow is disabled.
   * @type {boolean}
   */
  get disabled() {
    return (
      this.getAttribute('disabled') === 'true' || (this.hasAttribute('mobile-disabled') && !mediaQueryLarge.matches)
    );
  }

  /**
   * Indicates whether the slideshow is temporarily disabled (e.g., during infinite loop transition).
   * @type {boolean}
   */
  #disabled = false;

  /**
   * The interval ID for automatic playback.
   * @type {number|undefined}
   */
  #interval = undefined;

  /**
   * The Scroller instance that manages scrolling.
   * @type {Scroller}
   */
  #scroll;

  /**
   * The ResizeObserver instance for monitoring scroller size changes
   * @type {ResizeObserver}
   */
  #resizeObserver;

  /**
   * IntersectionObserver for efficient visibility tracking of slides
   * @type {IntersectionObserver | null}
   */
  #intersectionObserver = null;

  /**
   * Cached visible slides result from IntersectionObserver
   * @type {HTMLElement[]}
   */
  #visibleSlides = [];

  /**
   * Setup the slideshow without controls for zero or one slides
   */
  #setupSlideshowWithoutControls() {
    this.current = 0;
    if (this.hasAttribute('auto-hide-controls')) {
      const { slideshowControls } = this.refs;
      if (slideshowControls instanceof HTMLElement) {
        slideshowControls.hidden = true;
      }
    }

    if (this.refs.slides?.[0]) {
      this.refs.slides[0].setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * Setup the slideshow with controls for when there are multiple slides
   */
  #setupSlideshow() {
    // Setup IntersectionObserver first for efficient visibility tracking
    this.#setupIntersectionObserver();

    // Setup the scroll instance
    const { scroller } = this.refs;
    this.#scroll = new Scroller(scroller, {
      onScroll: this.#handleScroll,
      onScrollStart: this.#onTransitionInit,
      onScrollEnd: this.#onTransitionEnd,
    });

    this.#syncMobileCardSwipe();
    mediaQueryLarge.addEventListener('change', this.#syncMobileCardSwipe);

    if (this.hasAttribute('data-mobile-card-swipe')) {
      scroller.addEventListener('scroll', this.#updateMobileCardProgress, { passive: true });
      scroller.addEventListener('pointerdown', this.#onMobileCardStart);
      scroller.addEventListener('touchstart', this.#onMobileCardStart, { passive: true });
      this.addEventListener('click', this.#guardMobileCardSwipeClick, true);
    }

    scroller.addEventListener('mousedown', this.#handleMouseDown);
    if (!this.hasAttribute('data-mobile-card-swipe')) {
      scroller.addEventListener('pointerdown', this.#handleTouchDrag);
    }

    this.addEventListener('mouseenter', this.suspend);
    this.addEventListener('mouseleave', this.resume);
    this.addEventListener('pointerenter', this.#handlePointerEnter);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);

    this.#updateControlsVisibility();

    // Controls-only nested galleries keep their chevrons active while the parent
    // carousel owns drag gestures. Mobile card galleries stay enabled so photos swipe.
    const allowMobileCardSwipe = this.hasAttribute('data-mobile-card-swipe') && !mediaQueryLarge.matches;
    const disableForNesting = this.isNested && !this.hasAttribute('data-controls-only') && !allowMobileCardSwipe;
    this.disabled = disableForNesting || this.disabled;

    this.resume();

    this.current = this.initialSlideIndex;

    // Batch reads and writes to the DOM
    scheduler.schedule(() => {
      let visibleSlidesAmount = 0;
      const initialSlideId = this.initialSlide?.getAttribute('slide-id');

      // Wait for next frame to ensure layout is fully calculated before setting initial scroll position
      // This prevents race conditions on Safari mobile when section_width is 'full-width'
      requestAnimationFrame(() => {
        if (this.initialSlideIndex !== 0 && initialSlideId) {
          this.select({ id: initialSlideId }, undefined, { animate: false });
          visibleSlidesAmount = 1;
        } else {
          visibleSlidesAmount = this.#updateVisibleSlides();
          if (visibleSlidesAmount === 0) {
            this.select(0, undefined, { animate: false });
            visibleSlidesAmount = 1;
          }
        }

        this.#updateMobileCardProgress();
      });

      this.#resizeObserver = new ResizeObserver(async () => {
        if (viewTransition.current) await viewTransition.current;

        if (visibleSlidesAmount > 1) {
          this.#updateVisibleSlides();
        }

        if (this.hasAttribute('auto-hide-controls')) {
          this.#updateControlsVisibility();
        }
      });

      this.#resizeObserver.observe(this.refs.slideshowContainer);
    });
  }

  /**
   * Callback invoked on user initiated scroll to sync the current slide index
   * and emit a slide change event if the index has changed.
   */
  #handleScroll = () => {
    this.#updateMobileCardProgress();

    if (this.#mobileCardGesture) return;

    const previousIndex = this.#current;
    const index = this.#sync();

    if (index === previousIndex) return;

    const slide = this.slides?.[index];
    if (!slide) return;

    this.dispatchEvent(
      new SlideshowSelectEvent({
        index,
        previousIndex,
        userInitiated: true,
        trigger: 'scroll',
        slide,
        id: slide.getAttribute('slide-id'),
      })
    );
  };

  #onTransitionInit = () => {
    this.setAttribute('transitioning', '');
  };

  #onTransitionEnd = () => {
    if (!this.#mobileCardGesture) this.#updateVisibleSlides();
    this.removeAttribute('transitioning');
  };

  /**
   * Synchronizes the scroll position and updates the current slide index.
   * @returns {number} The index of the current slide.
   */
  #sync = () => {
    const { slides } = this;
    if (!slides) return (this.current = 0);

    if (!this.#scroll) return (this.current = 0);

    const visibleSlides = this.visibleSlides;

    if (!visibleSlides.length) return this.current;

    const { axis } = this.#scroll;
    const { scroller } = this.refs;
    const centers = visibleSlides.map((slide) => center(slide, axis));
    const referencePoint = visibleSlides.length > 1 ? scroller.getBoundingClientRect()[axis] : center(scroller, axis);
    const closestCenter = closest(centers, referencePoint);
    const closestVisibleSlide = visibleSlides[centers.indexOf(closestCenter)];

    if (!closestVisibleSlide) return (this.current = 0);

    const index = slides.indexOf(closestVisibleSlide);

    return (this.current = index);
  };

  #dragging = false;

  /**
   * Handles the 'mousedown' event to start dragging slides.
   * @param {MouseEvent} event - The mousedown event.
   */
  #syncMobileCardSwipe = () => {
    if (!this.hasAttribute('data-mobile-card-swipe')) return;

    if (mediaQueryLarge.matches) {
      if ((this.slides?.length || 0) > 1) this.setAttribute('data-fade-slides', '');
      this.#clearMobileCardLayout();
    } else {
      this.removeAttribute('data-fade-slides');
      this.setAttribute('in-viewport', '');
      this.#applyMobileCardLayout();
    }

    const allowMobileCardSwipe = !mediaQueryLarge.matches;
    if (this.isNested && !this.hasAttribute('data-controls-only')) {
      this.disabled = !allowMobileCardSwipe;
    }

    this.#updateMobileCardProgress();
  };

  #applyMobileCardLayout = () => {
    const { scroller } = this.refs;
    if (!scroller) return;

    scroller.style.setProperty('display', 'flex');
    scroller.style.setProperty('overflow-x', 'hidden');
    scroller.style.setProperty('overflow-y', 'hidden');
    scroller.style.setProperty('scroll-snap-type', 'none');
    scroller.style.setProperty('scroll-behavior', 'auto');
    scroller.style.setProperty('touch-action', 'pan-y');

    (this.refs.slides || []).forEach((slide) => {
      if (slide.hasAttribute('hidden') && !slide.hasAttribute('reveal')) return;
      slide.style.setProperty('flex', '0 0 100%');
      slide.style.setProperty('width', '100%');
      slide.style.setProperty('min-width', '100%');
      slide.style.setProperty('opacity', '1');
      slide.style.setProperty('pointer-events', 'auto');
      slide.style.setProperty('content-visibility', 'visible');
    });
  };

  #clearMobileCardLayout = () => {
    const { scroller } = this.refs;
    if (!scroller) return;

    ['display', 'overflow-x', 'overflow-y', 'scroll-snap-type', 'scroll-behavior', 'touch-action'].forEach((property) =>
      scroller.style.removeProperty(property)
    );

    (this.refs.slides || []).forEach((slide) => {
      ['flex', 'width', 'min-width', 'opacity', 'pointer-events', 'content-visibility'].forEach((property) =>
        slide.style.removeProperty(property)
      );
    });
  };

  #updateMobileCardProgress = () => {
    if (!this.hasAttribute('data-mobile-card-swipe')) return;

    const gallery = this.closest('.card-gallery');
    const track = gallery?.querySelector(':scope > .card-gallery__progress');
    const thumb = track?.querySelector('.card-gallery__progress-thumb');
    if (!(track instanceof HTMLElement) || !(thumb instanceof HTMLElement)) return;

    if (mediaQueryLarge.matches) {
      track.hidden = true;
      return;
    }

    const { scroller } = this.refs;
    const slideCount = this.slides?.length || 0;
    const maxScroll = scroller ? scroller.scrollWidth - scroller.clientWidth : 0;

    if (slideCount <= 1 && maxScroll <= 1) {
      track.hidden = true;
      return;
    }

    track.hidden = false;
    const trackWidth = track.clientWidth || 1;
    let thumbWidth;
    let progress = 0;

    if (maxScroll > 1 && scroller) {
      thumbWidth = Math.max((scroller.clientWidth / scroller.scrollWidth) * trackWidth, 12);
      progress = scroller.scrollLeft / maxScroll;
    } else {
      thumbWidth = Math.max(trackWidth / Math.max(slideCount, 1), 12);
      progress = slideCount > 1 ? this.current / (slideCount - 1) : 0;
    }

    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translate3d(${progress * (trackWidth - thumbWidth)}px, 0, 0)`;
  };

  #handleTouchDrag = (event) => {
    if (event.pointerType === 'mouse') return;
    if (this.hasAttribute('data-mobile-card-swipe')) return;
    this.#handleMouseDown(event);
  };

  /** @type {{ active: boolean, pointerId?: number, startX: number, startY: number, startScroll: number, startIndex: number, axis: 'x' | 'y' | null, moved: boolean, inputType?: 'touch' | 'pointer' | null }} */
  #mobileCardSwipe = {
    active: false,
    startX: 0,
    startY: 0,
    startScroll: 0,
    startIndex: 0,
    axis: null,
    moved: false,
  };

  #mobileCardSwiped = false;
  #mobileCardGesture = false;
  #pageScrollLocked = false;
  #pageScrollY = 0;

  /** @type {number} */
  #mobileCardAnimId = 0;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #mobileCardClickTimer;

  #cancelMobileCardAnim = () => {
    if (this.#mobileCardAnimId) {
      cancelAnimationFrame(this.#mobileCardAnimId);
      this.#mobileCardAnimId = 0;
    }
  };

  #preventPageScroll = (event) => {
    event.preventDefault();
    if (window.scrollY !== this.#pageScrollY) {
      window.scrollTo(window.scrollX, this.#pageScrollY);
    }
  };

  #lockPageScroll = () => {
    if (this.#pageScrollLocked) return;
    this.#pageScrollLocked = true;
    this.#pageScrollY = window.scrollY;
    document.documentElement.classList.add('card-swipe-lock');
    document.body.classList.add('card-swipe-lock');
    document.addEventListener('touchmove', this.#preventPageScroll, { passive: false, capture: true });
    document.addEventListener('wheel', this.#preventPageScroll, { passive: false, capture: true });
  };

  #unlockPageScroll = () => {
    if (!this.#pageScrollLocked) return;
    this.#pageScrollLocked = false;
    document.documentElement.classList.remove('card-swipe-lock');
    document.body.classList.remove('card-swipe-lock');
    document.removeEventListener('touchmove', this.#preventPageScroll, { capture: true });
    document.removeEventListener('wheel', this.#preventPageScroll, { capture: true });
    window.scrollTo(window.scrollX, this.#pageScrollY);
  };

  #setMobileCardOffset = (left) => {
    const { scroller } = this.refs;
    if (!scroller) return;
    scroller.scrollLeft = left;
    this.#updateMobileCardProgress();
  };

  #armMobileCardClickBlock = () => {
    this.#mobileCardSwiped = true;
    this.setAttribute('data-card-swiping', '');
    this.closest('product-card')?.setAttribute('data-card-swiping', '');
    clearTimeout(this.#mobileCardClickTimer);
    this.#mobileCardClickTimer = setTimeout(() => this.#clearMobileCardClickBlock(), 500);
  };

  #clearMobileCardClickBlock = () => {
    clearTimeout(this.#mobileCardClickTimer);
    this.#mobileCardClickTimer = undefined;
    this.#mobileCardSwiped = false;
    this.removeAttribute('data-card-swiping');
    this.closest('product-card')?.removeAttribute('data-card-swiping');
  };

  /**
   * Eases the card gallery to a scroll position so the next image slides in.
   * @param {number} targetLeft
   * @param {number} [duration]
   */
  #animateMobileCardTo = (targetLeft, duration = 360) => {
    const { scroller } = this.refs;
    if (!scroller) return;

    this.#cancelMobileCardAnim();
    this.#mobileCardGesture = true;

    const start = scroller.scrollLeft;
    const delta = targetLeft - start;
    if (Math.abs(delta) < 0.5) {
      this.#setMobileCardOffset(targetLeft);
      this.#mobileCardGesture = false;
      this.#unlockPageScroll();
      return;
    }

    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;

    const step = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      this.#setMobileCardOffset(start + delta * easeOutCubic(t));

      if (t < 1) {
        this.#mobileCardAnimId = requestAnimationFrame(step);
        return;
      }

      this.#mobileCardAnimId = 0;
      this.#setMobileCardOffset(targetLeft);
      this.#mobileCardGesture = false;
      this.#unlockPageScroll();
    };

    this.#mobileCardAnimId = requestAnimationFrame(step);
  };

  #unbindMobileCardSwipe = () => {
    document.removeEventListener('pointermove', this.#onMobileCardMove);
    document.removeEventListener('pointerup', this.#onMobileCardEnd);
    document.removeEventListener('pointercancel', this.#onMobileCardEnd);
    document.removeEventListener('touchmove', this.#onMobileCardMove);
    document.removeEventListener('touchend', this.#onMobileCardEnd);
    document.removeEventListener('touchcancel', this.#onMobileCardEnd);
    this.#mobileCardSwipe.active = false;
  };

  #onMobileCardStart = (event) => {
    if (!this.hasAttribute('data-mobile-card-swipe') || mediaQueryLarge.matches) return;
    if (this.#mobileCardSwipe.active || this.#dragging) return;
    if (event.target instanceof Element && event.target.closest('button, input, label, select, textarea, model-viewer')) {
      return;
    }

    const point = event.touches?.[0] ?? event;
    if (typeof point.clientX !== 'number') return;

    const { scroller } = this.refs;
    if (!scroller || (this.slides?.length || 0) <= 1) return;

    this.#cancelMobileCardAnim();
    this.#mobileCardGesture = true;
    this.#applyMobileCardLayout();

    this.#mobileCardSwipe = {
      active: true,
      pointerId: event.pointerId,
      startX: point.clientX,
      startY: point.clientY,
      startScroll: scroller.scrollLeft,
      startIndex: this.current,
      axis: null,
      moved: false,
      inputType: event.touches ? 'touch' : null,
    };

    document.addEventListener('touchmove', this.#onMobileCardMove, { passive: false });
    document.addEventListener('touchend', this.#onMobileCardEnd);
    document.addEventListener('touchcancel', this.#onMobileCardEnd);
    document.addEventListener('pointermove', this.#onMobileCardMove, { passive: false });
    document.addEventListener('pointerup', this.#onMobileCardEnd);
    document.addEventListener('pointercancel', this.#onMobileCardEnd);
  };

  #onMobileCardMove = (event) => {
    const state = this.#mobileCardSwipe;
    if (!state.active) return;
    if (state.inputType === 'touch' && event.type.startsWith('pointer')) return;
    if (event.type.startsWith('touch')) state.inputType = 'touch';
    if (event.pointerId != null && state.pointerId != null && event.pointerId !== state.pointerId) return;

    const point = event.touches?.[0] ?? event;
    if (typeof point.clientX !== 'number') return;

    const { scroller } = this.refs;
    if (!scroller) return;

    const dx = state.startX - point.clientX;
    const dy = state.startY - point.clientY;

    if (!state.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      state.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (state.axis === 'y') return;
      state.moved = true;
      this.#dragging = true;
      this.#armMobileCardClickBlock();
      this.setAttribute('dragging', '');
      scroller.style.setProperty('touch-action', 'none');
      this.#lockPageScroll();
    }

    if (state.axis !== 'x') return;

    event.preventDefault();
    event.stopPropagation();

    const maxScroll = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
    this.#setMobileCardOffset(Math.min(Math.max(state.startScroll + dx, 0), maxScroll));
  };

  #onMobileCardEnd = (event) => {
    const state = this.#mobileCardSwipe;
    if (!state.active) return;
    if (state.inputType === 'touch' && event.type.startsWith('pointer')) return;
    if (event.type.startsWith('pointer') && state.pointerId != null && event.pointerId !== state.pointerId) return;

    this.#unbindMobileCardSwipe();

    const { scroller } = this.refs;
    const slides = this.slides || [];
    const wasHorizontal = state.axis === 'x' && state.moved;

    this.#dragging = false;
    this.removeAttribute('dragging');
    scroller?.style.setProperty('touch-action', 'pan-y');

    if (!wasHorizontal || !scroller || slides.length <= 1) {
      this.#mobileCardGesture = false;
      this.#unlockPageScroll();
      return;
    }

    this.#armMobileCardClickBlock();

    const width = scroller.clientWidth || 1;
    const travelled = scroller.scrollLeft - state.startScroll;
    const flick = Math.abs(travelled) >= Math.min(36, width * 0.1);
    const direction = flick ? Math.sign(travelled) : 0;
    const index = clamp(state.startIndex + direction, 0, slides.length - 1);
    const targetLeft = slides[index]?.offsetLeft ?? index * width;

    this.#animateMobileCardTo(targetLeft);

    if (index !== this.current) {
      const slide = slides[index];
      const previousIndex = this.current;
      this.current = index;
      if (slide) {
        this.dispatchEvent(
          new SlideshowSelectEvent({
            index,
            previousIndex,
            userInitiated: true,
            trigger: 'drag',
            slide,
            id: slide.getAttribute('slide-id'),
          })
        );
      }
    }
  };

  #guardMobileCardSwipeClick = (event) => {
    if (!this.#mobileCardSwiped || mediaQueryLarge.matches) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#clearMobileCardClickBlock();
  };

  #handleMouseDown = (event) => {
    const { slides } = this;

    if (!slides || slides.length <= 1) return;
    if (!(event.target instanceof Element)) return;
    if (this.disabled || this.#dragging) return;
    if (this.hasAttribute('data-mobile-card-swipe') && !mediaQueryLarge.matches) return;
    if (
      !this.hasAttribute('data-mobile-card-swipe') &&
      event.target.closest('slideshow-component[data-mobile-card-swipe]')
    ) {
      return;
    }
    if (this.hasAttribute('data-controls-only') && mediaQueryLarge.matches) return;
    if (event.target.closest('button, input, label, select, textarea')) return;

    // Check if the event target is within a 3D model interactive element
    // This prevents the slideshow from capturing drag events when interacting with 3D models
    if (event.target.closest('model-viewer')) {
      return;
    }

    if (event.pointerType === 'mouse' || event.type === 'mousedown') {
      event.preventDefault();
    }
    // Store initial position but don't start handling yet
    const { axis } = this.#scroll;
    const startPosition = event[axis];
    const startY = event.clientY;
    const startIndex = this.current;

    const controller = new AbortController();
    const { signal } = controller;
    const startTime = performance.now();
    let previous = startPosition;
    let velocity = 0;
    let moved = false;
    let distanceTravelled = 0;
    let netDistance = 0;

    const suppressClick = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    this.#dragging = true;

    /**
     * Handles the 'pointermove' event to update the scroll position.
     * @param {PointerEvent} event - The pointermove event.
     */
    const onPointerMove = (event) => {
      const current = event[axis];
      const initialDelta = startPosition - current;
      const verticalDelta = startY - event.clientY;

      if (Math.abs(initialDelta) < 5 && Math.abs(verticalDelta) < 5) return;

      if (!moved) {
        if (Math.abs(verticalDelta) > Math.abs(initialDelta)) {
          controller.abort();
          return;
        }

        moved = true;
        event.preventDefault();
        this.setPointerCapture(event.pointerId);

        // Keep this listener alive through pointerup: browsers dispatch click
        // after pointerup, when the drag's AbortSignal has already been cleared.
        this.addEventListener('click', suppressClick, { once: true, capture: true });

        const movingRight = initialDelta < 0;
        const movingLeft = initialDelta > 0;

        // Check if the current slideshow should handle this drag
        const closestSlideshow = this.parentElement?.closest('slideshow-component');
        const isNested = closestSlideshow instanceof Slideshow && closestSlideshow !== this;
        const cannotMoveInDirection = (movingRight && this.atStart) || (movingLeft && this.atEnd);

        // Abort and let the parent slideshow handle the drag if we're moving in a direction where nested slideshow can't move
        if (isNested && cannotMoveInDirection) {
          controller.abort();
          return;
        }

        this.pause();
        this.setAttribute('dragging', '');
      }

      // Stop the event from bubbling up to parent slideshow components
      event.stopImmediatePropagation();

      const delta = previous - current;
      const timeDelta = performance.now() - startTime;
      velocity = Math.round((delta / timeDelta) * 1000);
      previous = current;
      distanceTravelled += Math.abs(delta);
      netDistance = initialDelta;

      this.#scroll.by(delta, { instant: true });
      this.#updateMobileCardProgress();
    };

    /**
     * Handles the 'pointerup' event to stop dragging slides.
     * @param {PointerEvent} event - The pointerup event.
     */
    const onPointerUp = async (event) => {
      controller.abort();
      const { current, slides } = this;
      const { scroller } = this.refs;

      this.#dragging = false;

      if (!moved) {
        this.#scroll.snap = true;
        return;
      }

      // Remove the fallback after the synthetic click following pointerup has
      // had a chance to fire.
      window.setTimeout(() => this.removeEventListener('click', suppressClick, { capture: true }), 0);

      if (!slides?.length || !scroller) return;

      const direction = Math.sign(velocity);
      const next = this.#sync();

      let newIndex;
      if (this.pageSize > 1) {
        const maxPage = Math.floor((slides.length - 1) / this.pageSize);
        const startPage = Math.floor(startIndex / this.pageSize);
        const nearestPage = clamp(Math.round(next / this.pageSize), 0, maxPage);
        const swipeDirection = Math.sign(netDistance);
        const targetPage =
          Math.abs(netDistance) >= 24 && swipeDirection !== 0
            ? clamp(startPage + swipeDirection, 0, maxPage)
            : nearestPage;

        newIndex = Math.min(targetPage * this.pageSize, slides.length - 1);
      } else {
        const modifier = current !== next || Math.abs(velocity) < 10 || distanceTravelled < 10 ? 0 : direction;
        newIndex = clamp(next + modifier, 0, slides.length - 1);
      }

      const newSlide = slides[newIndex];
      const currentIndex = this.current;

      if (!newSlide) throw new Error(`Slide not found at index ${newIndex}`);

      this.#scroll.to(newSlide);

      this.removeAttribute('dragging');
      if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId);

      this.#centerSelectedThumbnail(newIndex);

      this.dispatchEvent(
        new SlideshowSelectEvent({
          index: newIndex,
          previousIndex: currentIndex,
          userInitiated: true,
          trigger: 'drag',
          slide: newSlide,
          id: newSlide.getAttribute('slide-id'),
        })
      );

      this.current = newIndex;

      await this.#scroll.finished;

      // It's possible that the user started dragging again before the scroll finished
      if (this.#dragging) return;

      this.#scroll.snap = true;
      this.resume();
    };

    this.#scroll.snap = false;

    document.addEventListener('pointermove', onPointerMove, { signal });
    document.addEventListener('pointerup', onPointerUp, { signal });
    /**
     * pointerDown calls onPointerUp to fix an issue where the first tap-and-drag
     * on the zoom dialog is captured by the pointerMove/pointerUp listeners,
     * sometimes causing the slideshow to change slides unexpectedly
     */
    document.addEventListener('pointerdown', onPointerUp, { signal });
    document.addEventListener('pointercancel', onPointerUp, { signal });
    document.addEventListener('pointercapturelost', onPointerUp, { signal });
  };

  #handlePointerEnter = () => {
    this.setAttribute('actioned', '');
  };

  get slides() {
    return this.refs.slides?.filter((slide) => !slide.hasAttribute('hidden') || slide.hasAttribute('reveal'));
  }

  /**
   * The initial slide index.
   * @type {number}
   */
  get initialSlideIndex() {
    const initialSlide = this.getAttribute('initial-slide');
    if (initialSlide == null) return 0;

    return parseInt(initialSlide, 10);
  }

  /**
   * Pause the slideshow when the page is hidden.
   */
  #handleVisibilityChange = () => (document.hidden ? this.suspend() : this.resume());

  #updateControlsVisibility() {
    if (!this.hasAttribute('auto-hide-controls')) return;

    const { scroller, slideshowControls } = this.refs;

    if (!(slideshowControls instanceof HTMLElement)) return;

    slideshowControls.hidden = scroller.scrollWidth <= scroller.offsetWidth;
  }

  /**
   * Setup IntersectionObserver for efficient visibility tracking of slides
   */
  #setupIntersectionObserver() {
    const { slides, scroller } = this.refs;
    if (!slides?.length) return;

    if (this.#intersectionObserver) {
      this.#intersectionObserver.disconnect();
    }

    this.#intersectionObserver = new IntersectionObserver(
      (entries) => {
        const allEntries = [
          ...entries,
          ...(this.#intersectionObserver ? this.#intersectionObserver.takeRecords() : []),
        ];

        for (const entry of allEntries) {
          const slide = /** @type {HTMLElement} */ (entry.target);
          const isCurrentlyVisible = this.#visibleSlides.includes(slide);
          const shouldBeVisible = entry.intersectionRatio >= SLIDE_VISIBLITY_THRESHOLD;

          if (shouldBeVisible && !isCurrentlyVisible) {
            this.#visibleSlides.push(slide);
          } else if (!shouldBeVisible && isCurrentlyVisible) {
            const index = this.#visibleSlides.indexOf(slide);
            if (index > -1) {
              this.#visibleSlides.splice(index, 1);
            }
          }
        }

        this.#visibleSlides.sort((a, b) => slides.indexOf(a) - slides.indexOf(b));
        this.#updateVisibleSlides();
      },
      {
        root: scroller,
        threshold: SLIDE_VISIBLITY_THRESHOLD,
        // Add small margin to account for sub-pixel rendering
        rootMargin: '1px',
      }
    );

    // Observe all slides - observer will fire initial callback asynchronously
    slides.forEach((slide) => {
      this.#intersectionObserver?.observe(slide);
    });
  }

  /**
   * Centers the selected thumbnail in the thumbnails container
   * @param {number} index - The index of the selected thumbnail
   * @param {ScrollBehavior} [behavior] - The scroll behavior.
   */
  #centerSelectedThumbnail(index, behavior = 'smooth') {
    const selectedThumbnail = this.refs.thumbnails?.[index];
    if (!selectedThumbnail) return;

    const { thumbnailsContainer } = this.refs;
    if (!thumbnailsContainer || !(thumbnailsContainer instanceof HTMLElement)) return;

    const { slideshowControls } = this.refs;
    if (!slideshowControls || !(slideshowControls instanceof HTMLElement)) return;

    scrollIntoView(selectedThumbnail, {
      ancestor: thumbnailsContainer,
      behavior,
      block: 'center',
      inline: 'center',
    });
  }

  #updateVisibleSlides() {
    if (this.#mobileCardGesture) return this.slides?.length ? 1 : 0;

    const { slides } = this;
    if (!slides || !slides.length) return 0;

    if (this.hasAttribute('data-fade-slides')) {
      scheduler.schedule(() => {
        slides.forEach((slide, i) => {
          slide.setAttribute('aria-hidden', `${i !== this.current}`);
        });
      });
      return 1;
    }

    const visibleSlides = this.visibleSlides;

    // If the IntersectionObserver reports zero visible slides, then the slideshow has intersected, but no slides meet the visibility threshold.
    // Probably that the slideshow's host is mid-animation or zero-layout, like in an animating modal.
    // Don't stamp aria-hidden="true" on every slide. Set the current slide to the first visible slide.
    if (visibleSlides.length === 0) return 0;

    // Batch writes to the DOM
    scheduler.schedule(() => {
      // Update aria-hidden based on visibility
      slides.forEach((slide) => {
        const isVisible = visibleSlides.includes(slide);
        slide.setAttribute('aria-hidden', `${!isVisible}`);
      });
    });

    return visibleSlides.length;
  }
}

if (!customElements.get('slideshow-component')) {
  customElements.define('slideshow-component', Slideshow);
}
