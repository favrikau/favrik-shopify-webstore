const STUDIO_THRESHOLD = 250;
const TRANSPARENT_PIXEL_RATIO = 0.01;
const CANDIDATE_SELECTOR = '.product-media-container--png-candidate, .product-media-container--png';

/**
 * Makes the white studio field of a PNG transparent so the card
 * background color shows through. Only pixels connected to the
 * image edge are removed — the product itself is left alone.
 * @param {ImageData} imageData
 * @returns {boolean} whether any pixels were knocked out
 */
function knockoutStudioBackground(imageData) {
  const { width, height, data } = imageData;
  const seen = new Uint8Array(width * height);
  const stack = [];
  let changed = false;

  const isStudio = (pixelIndex) => {
    const i = pixelIndex * 4;
    return data[i + 3] > 0 && data[i] >= STUDIO_THRESHOLD && data[i + 1] >= STUDIO_THRESHOLD && data[i + 2] >= STUDIO_THRESHOLD;
  };

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixelIndex = y * width + x;
    if (seen[pixelIndex] || !isStudio(pixelIndex)) return;
    seen[pixelIndex] = 1;
    stack.push(pixelIndex);
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (stack.length) {
    const pixelIndex = stack.pop();
    data[pixelIndex * 4 + 3] = 0;
    changed = true;
    const x = pixelIndex % width;
    const y = (pixelIndex - x) / width;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return changed;
}

/**
 * @param {ImageData} imageData
 */
function hasMeaningfulTransparency(imageData) {
  const { data } = imageData;
  const total = data.length / 4;
  if (!total) return false;

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent++;
  }

  return transparent / total >= TRANSPARENT_PIXEL_RATIO;
}

/**
 * @param {HTMLImageElement} image
 */
function pngContainer(image) {
  return image.closest('.product-media-container--png-candidate, .product-media-container--png');
}

/**
 * Grey + scale is only for real cutout PNGs (transparent, or a white
 * studio field we can knock out). Opaque photos saved as .png stay full-bleed.
 * @param {HTMLImageElement} image
 */
async function applyPngCardBackground(image) {
  if (image.dataset.pngBgProcessed === 'true') return;
  image.dataset.pngBgProcessed = 'true';

  const container = pngContainer(image);

  try {
    if (!image.complete || image.naturalWidth === 0) {
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      });
    }
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      container?.classList.remove('product-media-container--png');
      return;
    }

    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const alreadyCutout = hasMeaningfulTransparency(imageData);
    const knockedOut = alreadyCutout ? false : knockoutStudioBackground(imageData);

    if (!alreadyCutout && !hasMeaningfulTransparency(imageData)) {
      container?.classList.remove('product-media-container--png');
      return;
    }

    container?.classList.add('product-media-container--png');

    if (!knockedOut) return;

    context.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    image.srcset = '';
    image.sizes = '';
    image.src = URL.createObjectURL(blob);
  } catch {
    image.dataset.pngBgProcessed = 'false';
    container?.classList.remove('product-media-container--png');
  }
}

/**
 * @param {ParentNode | Element} [root]
 */
function processPngImages(root = document) {
  const images = new Set();

  if (root instanceof HTMLImageElement) {
    if (root.classList.contains('product-media__image') && root.closest(CANDIDATE_SELECTOR)) {
      images.add(root);
    }
  } else if (root instanceof Element && root.matches(CANDIDATE_SELECTOR)) {
    root.querySelectorAll('.product-media__image').forEach((image) => {
      if (image instanceof HTMLImageElement) images.add(image);
    });
  }

  if (root.querySelectorAll) {
    root.querySelectorAll(`${CANDIDATE_SELECTOR} .product-media__image`).forEach((image) => {
      if (image instanceof HTMLImageElement) images.add(image);
    });
  }

  images.forEach((image) => applyPngCardBackground(image));
}

function watchPngImages(root = document) {
  root.querySelectorAll(CANDIDATE_SELECTOR).forEach((container) => visibilityObserver.observe(container));
  processPngImages(root);
}

const visibilityObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      processPngImages(entry.target);
      visibilityObserver.unobserve(entry.target);
    }
  },
  { rootMargin: '200px' }
);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => watchPngImages(), { once: true });
} else {
  watchPngImages();
}

window.addEventListener('load', () => watchPngImages());
document.addEventListener('shopify:section:load', (event) => {
  watchPngImages(event.target instanceof HTMLElement ? event.target : document);
});

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (
        node.matches?.(CANDIDATE_SELECTOR) ||
        node.matches?.('.product-media__image') ||
        node.querySelector?.(CANDIDATE_SELECTOR)
      ) {
        watchPngImages(node.matches('.product-media__image') ? document : node);
      }
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
