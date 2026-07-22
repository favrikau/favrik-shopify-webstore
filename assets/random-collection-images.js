function initHomepageScrollAnimations() {
  const landscapeLogoSections = document.querySelectorAll('.collection-image-duo__landscape');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    landscapeLogoSections.forEach((section) => section.classList.add('is-logo-revealed'));
    return;
  }

  const logoRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-logo-revealed', entry.isIntersecting);
      });
    },
    { threshold: 0.2 }
  );

  landscapeLogoSections.forEach((section) => logoRevealObserver.observe(section));
}

initHomepageScrollAnimations();
document.addEventListener('shopify:section:load', initHomepageScrollAnimations);

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
      card.toggleAttribute('hidden', !selectedCards.has(card));
    });

    list.dataset.randomProductsInitialized = 'true';
  });
}

initRandomProductLists();
document.addEventListener('shopify:section:load', (event) => {
  if (event.target instanceof Element) initRandomProductLists(event.target);
});

/** @type {Set<string>} */
const usedProductUrls = new Set();

/** @type {Set<string>} */
const usedProductIds = new Set();

/**
 * Picks a unique random image for each slot in a three-column collection image row.
 */
const trioSections = document.querySelectorAll('[data-random-image-trio]');

trioSections.forEach((section) => {
  const candidates = [...section.querySelectorAll('[data-trio-candidate]')];
  const slots = [...section.querySelectorAll('[data-trio-slot]')];

  if (candidates.length === 0 || slots.length === 0) return;

  const shuffled = shuffleArray(candidates);
  const selected = shuffled.slice(0, slots.length);

  slots.forEach((slot, index) => {
    const candidate = selected[index] ?? shuffled[index % shuffled.length];
    if (!candidate) return;

    const sourceImage = candidate.querySelector('img');
    if (!sourceImage) return;

    const link = slot.querySelector('.collection-image-trio__link');
    const media = slot.querySelector('.collection-image-trio__media');

    if (!media) return;

    const image = sourceImage.cloneNode(true);
    image.loading = 'eager';

    const existingImage = media.querySelector('.collection-image-trio__img, img');
    if (existingImage) {
      existingImage.replaceWith(image);
    } else {
      media.prepend(image);
    }

    const productUrl = candidate.dataset.productUrl;
    const productId = candidate.dataset.productId;

    if (productUrl) {
      usedProductUrls.add(productUrl);
    }

    if (productId) {
      usedProductIds.add(productId);
    }

    if (link && productUrl) {
      link.href = productUrl;
    }
  });
});

/**
 * Picks unique random images for the asymmetric duo row, excluding trio selections.
 * The landscape slot prefers horizontal gallery images to minimize cropping.
 */
const duoSections = document.querySelectorAll('[data-random-image-duo]');

/**
 * @param {Element} candidate
 */
function getCandidateAspect(candidate) {
  const aspect = Number.parseFloat(candidate.getAttribute('data-image-aspect') ?? '');
  if (Number.isFinite(aspect) && aspect > 0) return aspect;

  const image = candidate.querySelector('img');
  const width = Number.parseFloat(image?.getAttribute('width') ?? '');
  const height = Number.parseFloat(image?.getAttribute('height') ?? '');

  if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
    return width / height;
  }

  return 0;
}

/**
 * @param {Element[]} candidates
 */
function chooseLandscapeCandidate(candidates) {
  if (candidates.length === 0) return undefined;

  const targetAspect = 16 / 7;
  const horizontalCandidates = candidates.filter((candidate) => getCandidateAspect(candidate) >= 1.1);

  if (horizontalCandidates.length === 0) {
    return shuffleArray(candidates).sort((a, b) => getCandidateAspect(b) - getCandidateAspect(a))[0];
  }

  return shuffleArray(horizontalCandidates).sort((a, b) => {
    return Math.abs(getCandidateAspect(a) - targetAspect) - Math.abs(getCandidateAspect(b) - targetAspect);
  })[0];
}

/**
 * @param {Element} slot
 * @param {Element | undefined} candidate
 */
function applyDuoCandidate(slot, candidate) {
  if (!candidate) return;

  const sourceImage = candidate.querySelector('img');
  if (!sourceImage) return;

  const link = slot.querySelector('.collection-image-duo__link');
  const media = slot.querySelector('.collection-image-duo__media');

  if (!media) return;

  const image = sourceImage.cloneNode(true);
  image.loading = 'eager';

  const existingImage = media.querySelector('.collection-image-duo__img, img');
  if (existingImage) {
    existingImage.replaceWith(image);
  } else {
    media.prepend(image);
  }

  const productUrl = candidate.getAttribute('data-product-url');
  const productId = candidate.getAttribute('data-product-id');

  if (productUrl) {
    usedProductUrls.add(productUrl);
  }

  if (productId) {
    usedProductIds.add(productId);
  }

  if (link && productUrl) {
    link.href = productUrl;
  }
}

duoSections.forEach((section) => {
  const candidates = [...section.querySelectorAll('[data-duo-candidate]')].filter((candidate) => {
    const productUrl = candidate.dataset.productUrl ?? '';
    const productId = candidate.dataset.productId ?? '';

    return !usedProductUrls.has(productUrl) && !usedProductIds.has(productId);
  });
  const slots = [...section.querySelectorAll('[data-duo-slot]')];

  if (candidates.length === 0 || slots.length === 0) return;

  const shuffled = shuffleArray(candidates);
  const selected = shuffled.slice(0, slots.length);

  slots.forEach((slot, index) => {
    applyDuoCandidate(slot, selected[index]);
  });

  const landscapeSlot = section.querySelector('[data-duo-landscape-slot]');
  if (!landscapeSlot) return;

  const landscapeCandidates = [...section.querySelectorAll('[data-duo-landscape-candidate]')].filter((candidate) => {
    const productUrl = candidate.getAttribute('data-product-url') ?? '';
    const productId = candidate.getAttribute('data-product-id') ?? '';

    return !usedProductUrls.has(productUrl) && !usedProductIds.has(productId);
  });
  const fallbackCandidates = candidates.filter((candidate) => {
    const productUrl = candidate.getAttribute('data-product-url') ?? '';
    const productId = candidate.getAttribute('data-product-id') ?? '';

    return !usedProductUrls.has(productUrl) && !usedProductIds.has(productId);
  });
  const landscapeCandidate = chooseLandscapeCandidate(
    landscapeCandidates.length > 0 ? landscapeCandidates : fallbackCandidates
  );

  applyDuoCandidate(landscapeSlot, landscapeCandidate);
});

