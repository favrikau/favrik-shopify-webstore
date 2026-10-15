const randomImagePools = document.querySelectorAll('[data-random-collection-image]');

randomImagePools.forEach((pool) => {
  const images = [...pool.querySelectorAll('.resource-image__random-image')];
  if (images.length < 2) {
    images[0]?.classList.add('is-active');
    return;
  }

  const preferLandscape = pool.getAttribute('data-prefer-landscape') === 'true';
  const preferPortrait = pool.getAttribute('data-prefer-portrait') === 'true';

  let preferredImages = [];
  if (preferLandscape) {
    preferredImages = images.filter((image) => {
      const aspect = Number.parseFloat(image.getAttribute('data-image-aspect') ?? '');
      return Number.isFinite(aspect) && aspect >= 1.2;
    });
  } else if (preferPortrait) {
    preferredImages = images.filter((image) => {
      const aspect = Number.parseFloat(image.getAttribute('data-image-aspect') ?? '');
      return Number.isFinite(aspect) && aspect <= 0.9;
    });
  }

  const poolImages = preferredImages.length > 0 ? preferredImages : images;
  const activeImage = poolImages[Math.floor(Math.random() * poolImages.length)];

  images.forEach((image) => image.classList.remove('is-active'));
  activeImage.classList.add('is-active');
});

/**
 * @param {unknown[]} array
 */
function shuffleArray(array) {
  const shuffled = [...array];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

/**
 * @param {HTMLElement} section
 */
function getSignatureCarouselSlidesPerPage(section) {
  const carousel = section.querySelector('slideshow-component[data-page-size-desktop]');
  const desktopColumns = Number.parseInt(carousel?.getAttribute('data-page-size-desktop') ?? '4', 10);

  if (window.matchMedia('(max-width: 749px)').matches) return 1;

  return Number.isFinite(desktopColumns) ? Math.max(1, desktopColumns) : 4;
}

/**
 * @param {HTMLElement} section
 */
function getSignatureCarouselVisibleSlides(section) {
  const slidesContainer = section.querySelector(
    'slideshow-component[data-page-size-desktop] > slideshow-container > slideshow-slides'
  );
  if (!(slidesContainer instanceof HTMLElement)) return { slidesContainer: null, slides: [] };

  const slides = [...slidesContainer.querySelectorAll(':scope > slideshow-slide')].filter(
    (slide) => !slide.hasAttribute('hidden')
  );

  return { slidesContainer, slides };
}

/**
 * Snaps the signature collection carousel by full pages (columns visible at once), not single cards.
 *
 * @param {HTMLElement} list
 */
function updateSignatureCarouselPageSnap(list) {
  const { slidesContainer, slides } = getSignatureCarouselVisibleSlides(list);
  if (!(slidesContainer instanceof HTMLElement)) return;

  const perPage = getSignatureCarouselSlidesPerPage(list);

  slides.forEach((slide, index) => {
    if (slide instanceof HTMLElement) {
      slide.style.scrollSnapAlign = index % perPage === 0 ? 'start' : 'none';
      slide.style.scrollSnapStop = index % perPage === 0 ? 'always' : 'normal';
    }
  });
}

/**
 * Randomly selects the visible cards in homepage product lists marked as random.
 * The first configured set remains visible as a no-JavaScript fallback.
 *
 * @param {Document | Element} root
 */
function initRandomProductLists(root = document) {
  const lists = [
    ...(root instanceof Element && root.matches('[data-random-product-list]') ? [root] : []),
    ...root.querySelectorAll('[data-random-product-list]'),
  ];

  lists.forEach((list) => {
    if (!(list instanceof HTMLElement) || list.dataset.randomProductsInitialized === 'true') return;

    const cards = [...list.querySelectorAll('[data-random-product-card]')];
    const requestedLimit = Number.parseInt(list.dataset.randomProductLimit ?? '8', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, requestedLimit) : 8;
    const selectedCards = new Set(shuffleArray(cards).slice(0, limit));

    cards.forEach((card) => {
      const isSelected = selectedCards.has(card);
      card.toggleAttribute('hidden', !isSelected);

      const slide = card.closest('slideshow-slide');
      if (slide instanceof HTMLElement) {
        slide.toggleAttribute('hidden', !isSelected);
      }
    });

    list.dataset.randomProductsInitialized = 'true';
    updateSignatureCarouselPageSnap(list);
  });
}

/**
 * @param {Document | Element} root
 */
function initSignatureCarouselPageSnap(root = document) {
  const sections = [
    ...(root instanceof Element && root.matches('.homepage-signature-product-carousel') ? [root] : []),
    ...root.querySelectorAll('.homepage-signature-product-carousel'),
  ];

  sections.forEach((section) => {
    if (!(section instanceof HTMLElement)) return;
    updateSignatureCarouselPageSnap(section);
  });
}

initRandomProductLists();
initSignatureCarouselPageSnap();
document.addEventListener('shopify:section:load', (event) => {
  if (event.target instanceof Element) {
    initRandomProductLists(event.target);
    initSignatureCarouselPageSnap(event.target);
  }
});

let signatureCarouselResizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(signatureCarouselResizeTimer);
  signatureCarouselResizeTimer = window.setTimeout(() => initSignatureCarouselPageSnap(), 150);
});
