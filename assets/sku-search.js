const catalogQueries = new Map();

const normalizeSearchTerm = (value) => String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

function parseSearchProducts(document) {
  const data = document.querySelector('[data-collection-sku-search-data]');
  if (!data) throw new Error('Search product data is missing');
  const products = JSON.parse(data.textContent);
  if (!Array.isArray(products)) throw new Error('Search product data is invalid');
  return products.filter((product) => product.title && product.url && Array.isArray(product.terms));
}

async function fetchSearchDocument(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'text/html' } });
  if (!response.ok) {
    const error = new Error(`Search request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return new DOMParser().parseFromString(await response.text(), 'text/html');
}

async function searchCatalog(query, searchUrl, pageUrl, signal) {
  const url = new URL(searchUrl, window.location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('section_id', 'sku-search-results');
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '8');
  url.searchParams.set('resources[options][unavailable_products]', 'show');
  if (catalogQueries.has(url.href)) return catalogQueries.get(url.href);

  let document;
  try {
    document = await fetchSearchDocument(url, signal);
  } catch (error) {
    if (error.status !== 417 || !pageUrl) throw error;
    const fallback = new URL(pageUrl, window.location.origin);
    fallback.searchParams.set('q', query);
    fallback.searchParams.set('type', 'product');
    fallback.searchParams.set('section_id', 'sku-search-results');
    fallback.searchParams.set('options[prefix]', 'last');
    fallback.searchParams.set('options[unavailable_products]', 'show');
    document = await fetchSearchDocument(fallback, signal);
  }
  const products = parseSearchProducts(document);
  if (catalogQueries.size >= 50) catalogQueries.delete(catalogQueries.keys().next().value);
  catalogQueries.set(url.href, products);
  return products;
}

function getProductMatch(product, query) {
  const terms = product.terms.map((label) => ({ label: String(label), normalized: normalizeSearchTerm(label) }));
  const tests = [
    (term) => term === query,
    (term) => term.startsWith(query),
    (term) => term.includes(query),
    (term) => query.split(' ').every((word) => term.includes(word)),
  ];
  for (const [score, test] of tests.entries()) {
    const term = terms.find((term) => test(term.normalized));
    if (term) return { product, matchedTerm: term.label, score };
  }
  return null;
}

export function initSkuSearchForms() {
  document.querySelectorAll('[data-collection-sku-search]').forEach((searchForm) => {
    if (!(searchForm instanceof HTMLElement) || searchForm.dataset.skuSearchInitialized === 'true') return;
    const input = searchForm.querySelector('[data-collection-sku-search-input]');
    const results = searchForm.querySelector('[data-collection-sku-search-results]');
    const searchUrl = searchForm.dataset.skuSearchUrl;
    if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !searchUrl) return;
    searchForm.dataset.skuSearchInitialized = 'true';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');

    const isHeaderSearch = searchForm.closest('[data-header-sku-search]') !== null;
    let timer;
    let controller;
    let version = 0;

    const closeResults = () => {
      results.hidden = true;
      results.removeAttribute('aria-busy');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      results.replaceChildren();
    };

    const cancelSearch = () => {
      version += 1;
      clearTimeout(timer);
      controller?.abort();
      closeResults();
    };

    const showStatus = (message, loading = false) => {
      results.replaceChildren();
      const status = document.createElement('p');
      status.className = 'facets__sku-search-empty';
      status.setAttribute('role', 'status');
      status.textContent = message;
      results.append(status);
      results.hidden = false;
      results.setAttribute('aria-busy', String(loading));
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    };

    const navigateToProduct = (url) => {
      if (url) window.location.href = url;
    };

    const renderMatches = (matches) => {
      results.replaceChildren();
      results.removeAttribute('aria-busy');
      if (!matches.length) {
        showStatus(searchForm.dataset.skuSearchEmpty);
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
        button.id = `${results.id}-option-${index}`;
        button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        imageWrap.className = 'facets__sku-search-option-image';

        if (product.image) {
          const image = document.createElement('img');
          const imageUrl = new URL(product.image, window.location.href);
          if (imageUrl.pathname.toLowerCase().endsWith('.png')) {
            imageWrap.classList.add('product-media-container--png-candidate');
            image.classList.add('product-media__image');
            image.crossOrigin = 'anonymous';
            imageUrl.searchParams.set('format', 'png');
          }
          image.src = imageUrl.href;
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
        });
        button.addEventListener('click', () => navigateToProduct(product.url));

        results.append(button);
      });

      if (searchForm.dataset.skuSearchPageUrl) {
        const url = new URL(searchForm.dataset.skuSearchPageUrl, window.location.origin);
        url.searchParams.set('q', input.value.trim());
        url.searchParams.set('type', 'product');
        url.searchParams.set('options[prefix]', 'last');
        url.searchParams.set('options[unavailable_products]', 'show');
        const link = document.createElement('a');
        link.className = 'facets__sku-search-view-all';
        link.id = `${results.id}-option-${matches.length}`;
        link.href = url.href;
        link.dataset.url = url.href;
        link.setAttribute('role', 'option');
        link.setAttribute('aria-selected', 'false');
        link.textContent = searchForm.dataset.skuSearchViewAll;
        results.append(link);
      }

      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', `${results.id}-option-0`);
    };

    const runSearch = async (query, requestVersion) => {
      if (!searchForm.isConnected || version !== requestVersion) return;
      controller = new AbortController();
      try {
        const products = await searchCatalog(query, searchUrl, searchForm.dataset.skuSearchPageUrl, controller.signal);
        if (!searchForm.isConnected || version !== requestVersion) return;
        const normalizedQuery = normalizeSearchTerm(query);
        const matches = products.map((product) => getProductMatch(product, normalizedQuery) ||
          { product, matchedTerm: product.title, score: 4 });
        renderMatches(matches.slice(0, 8));
      } catch (error) {
        if (error.name !== 'AbortError' && searchForm.isConnected && version === requestVersion) {
          showStatus(searchForm.dataset.skuSearchError);
        }
      }
    };

    input.addEventListener('input', () => {
      version += 1;
      clearTimeout(timer);
      controller?.abort();
      const query = input.value.trim();
      if (!query) {
        closeResults();
        return;
      }
      showStatus(searchForm.dataset.skuSearchLoading, true);
      const requestVersion = version;
      timer = setTimeout(() => runSearch(query, requestVersion), 180);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        cancelSearch();
        input.blur();
        return;
      }
      const options = [...results.querySelectorAll('[role="option"]')];
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
        event.preventDefault();
        const current = options.findIndex((option) => option.classList.contains('is-active'));
        const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => {
          option.classList.toggle('is-active', index === next);
          option.setAttribute('aria-selected', String(index === next));
        });
        input.setAttribute('aria-activedescendant', options[next].id);
        options[next].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (event.key !== 'Enter') return;
      if (isHeaderSearch && window.matchMedia('(max-width: 749px)').matches) {
        event.preventDefault();
        input.blur();
        return;
      }
      const activeOption = results.querySelector('[role="option"].is-active');
      if (!(activeOption instanceof HTMLElement)) return;
      event.preventDefault();
      navigateToProduct(activeOption.dataset.url);
    });

    input.addEventListener('blur', () => {
      if (isHeaderSearch && window.matchMedia('(max-width: 749px)').matches) return;
      setTimeout(() => {
        if (!searchForm.contains(document.activeElement)) cancelSearch();
      }, 120);
    });
  });
}

initSkuSearchForms();
window.addEventListener('collection:facets-rendered', initSkuSearchForms);
document.addEventListener('shopify:section:load', initSkuSearchForms);
