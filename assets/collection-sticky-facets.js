const pageWrapper = document.querySelector('.page-wrapper');
const scrollTarget = pageWrapper && getComputedStyle(pageWrapper).overflowY !== 'visible' ? pageWrapper : window;

let ticking = false;

// Whether the header has collapsed into its compact "affixed" bar.
let headerCollapsed = false;

// Whether the facets bar itself is showing its "stuck" styling (background/blur).
let facetsStuck = false;

// The header's height while fully expanded, cached so the header-collapse
// trigger below has a stable reference point instead of the live
// `--header-height`, which shrinks the instant the header collapses.
let expandedHeaderHeight = null;

// How many pixels *before* the facets bar would naturally reach the sticky
// boundary the header should already finish collapsing. Without this lead,
// the header's collapse (which shrinks `--header-height`) and the facets
// bar's own sticky offset (`top: var(--header-height)`) would both react to
// the same live value at the same scroll pixel: the header collapses, the
// bar's sticky anchor jumps up to match, that jump flips the bar's
// stuck/unstuck determination, the header re-expands, and the cycle repeats
// rapidly. Collapsing the header early — while the bar is still safely
// scrolling and not yet pinned — lets `--header-height` settle before the
// bar ever needs to reference it.
const HEADER_COLLAPSE_LEAD_PX = 32;

const getHeaderOffset = () => {
  const headerHeight = getComputedStyle(document.body).getPropertyValue('--header-height');
  const parsedHeight = Number.parseFloat(headerHeight);

  return Number.isFinite(parsedHeight) ? parsedHeight : 48;
};

const getScrollTop = () => {
  if (scrollTarget instanceof Window) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  return scrollTarget.scrollTop;
};

const updateStickyState = () => {
  const stickyFacetBars = [...document.querySelectorAll('.facets-block-wrapper--horizontal, .facets-toggle')];
  const header = document.getElementById('header-component');
  const isAtTop = getScrollTop() <= 2;
  const visibleFacetBars = stickyFacetBars.filter((bar) => {
    const rect = bar.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  });

  // Keep a fresh reading of the header's expanded height while it isn't
  // currently collapsed, so the collapse trigger below always compares
  // against an accurate (but stable, pre-collapse) baseline.
  if (!headerCollapsed) {
    const liveHeight = getHeaderOffset();
    if (liveHeight > 0) expandedHeaderHeight = liveHeight;
  }

  const collapseReference = (expandedHeaderHeight ?? getHeaderOffset()) + HEADER_COLLAPSE_LEAD_PX;

  if (isAtTop || visibleFacetBars.length === 0) {
    headerCollapsed = false;
  } else if (headerCollapsed) {
    // Exit only after the bar has clearly moved away from the collapse boundary.
    headerCollapsed = visibleFacetBars.some((bar) => bar.getBoundingClientRect().top <= collapseReference + 12);
  } else {
    // Enter a lead distance before the bar actually reaches the sticky boundary.
    headerCollapsed = visibleFacetBars.some((bar) => bar.getBoundingClientRect().top <= collapseReference + 1);
  }

  if (header instanceof HTMLElement) {
    const wasCollapsed = header.hasAttribute('data-collection-facets-affixed');

    if (headerCollapsed) {
      if (!wasCollapsed) header.removeAttribute('data-collection-header-expanded');
      header.setAttribute('data-collection-facets-affixed', 'true');
    } else {
      header.removeAttribute('data-collection-facets-affixed');
      header.removeAttribute('data-collection-header-expanded');
    }
  }

  // The bar's own "stuck" styling is evaluated against the *current* header
  // height. By the time the bar reaches this (lower) threshold, the header
  // above has already collapsed and settled into its final compact height
  // (see HEADER_COLLAPSE_LEAD_PX above), so this reference is stable and the
  // bar's sticky anchor won't jump out from under this calculation.
  const stickyTop = getHeaderOffset();

  if (isAtTop || visibleFacetBars.length === 0) {
    facetsStuck = false;
  } else if (facetsStuck) {
    // Exit only after the bar has clearly moved away from the sticky boundary.
    facetsStuck = visibleFacetBars.some((bar) => bar.getBoundingClientRect().top <= stickyTop + 12);
  } else {
    // Enter only after the bar has actually reached the sticky boundary.
    facetsStuck = visibleFacetBars.some((bar) => bar.getBoundingClientRect().top <= stickyTop + 1);
  }

  stickyFacetBars.forEach((bar) => {
    bar.classList.toggle('is-facets-stuck', facetsStuck && visibleFacetBars.includes(bar));
  });

  ticking = false;
};

const requestStickyUpdate = () => {
  if (ticking) return;

  ticking = true;
  window.requestAnimationFrame(updateStickyState);
};

function initSkuSearchForms() {
  const skuSearchForms = [...document.querySelectorAll('[data-collection-sku-search]')];

  skuSearchForms.forEach((searchForm) => {
    if (searchForm instanceof HTMLElement && searchForm.dataset.skuSearchInitialized === 'true') return;
    if (searchForm instanceof HTMLElement) searchForm.dataset.skuSearchInitialized = 'true';
  const input = searchForm.querySelector('[data-collection-sku-search-input]');
  const results = searchForm.querySelector('[data-collection-sku-search-results]');
  const dataScript = searchForm.querySelector('[data-collection-sku-search-data]');

  if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !dataScript?.textContent) return;

  /** @type {{ title: string; price: string; image: string; url: string; terms: string[] }[]} */
  let products = [];

  try {
    products = JSON.parse(dataScript.textContent);
  } catch {
    products = [];
  }

  const normalizedProducts = products
    .map((product) => ({
      ...product,
      normalizedTerms: product.terms
        .map((term) => {
          const label = String(term).trim();

          return label
            ? {
                label,
                normalized: label.toLowerCase(),
              }
            : null;
        })
        .filter(Boolean),
    }))
    .filter((product) => product.title && product.url && product.normalizedTerms.length > 0);

  const closeResults = () => {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    results.replaceChildren();
  };

  const navigateToProduct = (url) => {
    if (!url) return;
    window.location.href = url;
  };

  const renderResults = () => {
    const query = input.value.trim().toLowerCase();
    results.replaceChildren();

    if (query.length < 1) {
      closeResults();
      return;
    }

    const matches = normalizedProducts
      .map((product) => {
        const matchedTerm = product.normalizedTerms.find((term) => term.normalized.includes(query));

        return matchedTerm
          ? {
              product,
              matchedTerm: matchedTerm.label,
              startsWithQuery: matchedTerm.normalized.startsWith(query),
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.startsWithQuery) - Number(a.startsWithQuery))
      .slice(0, 8);

    if (matches.length === 0) {
      closeResults();
      return;
    }

    matches.forEach(({ product, matchedTerm }, index) => {
      const button = document.createElement('button');
      const imageWrap = document.createElement('span');
      const content = document.createElement('span');
      const title = document.createElement('span');
      const meta = document.createElement('span');
      const match = document.createElement('span');
      const price = document.createElement('span');

      button.type = 'button';
      button.className = 'facets__sku-search-option';
      button.setAttribute('role', 'option');
      button.dataset.url = product.url;
      imageWrap.className = 'facets__sku-search-option-image';

      if (product.image) {
        const image = document.createElement('img');
        image.src = product.image;
        image.alt = '';
        image.loading = 'lazy';
        imageWrap.append(image);
      }

      content.className = 'facets__sku-search-option-content';
      title.className = 'facets__sku-search-option-title';
      title.textContent = product.title;
      meta.className = 'facets__sku-search-option-meta';
      match.className = 'facets__sku-search-option-match';
      match.textContent = matchedTerm;
      price.className = 'facets__sku-search-option-price';
      price.textContent = product.price;
      meta.append(match, price);
      content.append(title, meta);
      button.append(imageWrap, content);

      if (index === 0) {
        button.classList.add('is-active');
      }

      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        navigateToProduct(product.url);
      });

      results.append(button);
    });

    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeResults();
      input.blur();
      return;
    }

    if (event.key !== 'Enter') return;

    const activeOption = results.querySelector('.facets__sku-search-option.is-active');
    if (!(activeOption instanceof HTMLElement)) return;

    event.preventDefault();
    navigateToProduct(activeOption.dataset.url);
  });
  input.addEventListener('blur', () => {
    window.setTimeout(closeResults, 120);
  });
  });
}

function refreshCollectionFacetHeader() {
  requestStickyUpdate();
  initSkuSearchForms();
}

refreshCollectionFacetHeader();
scrollTarget.addEventListener('scroll', requestStickyUpdate, { passive: true });
window.addEventListener('resize', requestStickyUpdate, { passive: true });
window.addEventListener('collection:facets-rendered', refreshCollectionFacetHeader);
window.addEventListener('collection:header-expanded', requestStickyUpdate);
document.addEventListener('shopify:section:load', refreshCollectionFacetHeader);
