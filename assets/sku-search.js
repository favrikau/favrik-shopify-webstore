/**
 * Initializes SKU/name autocomplete search forms.
 */
export function initSkuSearchForms() {
  const skuSearchForms = [...document.querySelectorAll('[data-collection-sku-search]')];

  skuSearchForms.forEach((searchForm) => {
    if (searchForm instanceof HTMLElement && searchForm.dataset.skuSearchInitialized === 'true') return;
    if (searchForm instanceof HTMLElement) searchForm.dataset.skuSearchInitialized = 'true';

    const input = searchForm.querySelector('[data-collection-sku-search-input]');
    const results = searchForm.querySelector('[data-collection-sku-search-results]');
    const dataScript = searchForm.querySelector('[data-collection-sku-search-data]');

    if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !dataScript?.textContent) return;

    const isHeaderSearch = searchForm.closest('[data-header-sku-search]') !== null;

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
        if (isHeaderSearch) {
          const emptyMessage = document.createElement('p');
          emptyMessage.className = 'facets__sku-search-empty';
          emptyMessage.setAttribute('role', 'status');
          emptyMessage.textContent = 'No Matching Products';
          results.append(emptyMessage);
          results.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          return;
        }

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
          image.alt = product.title || '';
          image.loading = 'lazy';
          image.decoding = 'async';
          imageWrap.append(image);
        } else {
          const placeholderLogo = searchForm.dataset.placeholderLogo || '';
          const placeholder = document.createElement('span');
          const label = document.createElement('span');

          imageWrap.classList.add('facets__sku-search-option-image--placeholder');
          placeholder.className = 'facets__sku-search-option-placeholder';
          label.className = 'facets__sku-search-option-placeholder-text';
          label.textContent = 'Coming soon';

          if (placeholderLogo) {
            const logo = document.createElement('img');
            logo.src = placeholderLogo;
            logo.alt = '';
            logo.className = 'facets__sku-search-option-placeholder-logo';
            logo.loading = 'lazy';
            placeholder.append(logo);
          }

          placeholder.append(label);
          imageWrap.append(placeholder);
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

      if (isHeaderSearch && window.matchMedia('(max-width: 749px)').matches) {
        event.preventDefault();
        input.blur();
        return;
      }

      const activeOption = results.querySelector('.facets__sku-search-option.is-active');
      if (!(activeOption instanceof HTMLElement)) return;

      event.preventDefault();
      navigateToProduct(activeOption.dataset.url);
    });
    input.addEventListener('blur', () => {
      if (isHeaderSearch && window.matchMedia('(max-width: 749px)').matches) return;

      window.setTimeout(closeResults, 120);
    });
  });
}

initSkuSearchForms();
window.addEventListener('collection:facets-rendered', initSkuSearchForms);
document.addEventListener('shopify:section:load', initSkuSearchForms);
