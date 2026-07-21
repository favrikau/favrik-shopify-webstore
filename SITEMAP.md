# Favrik Shopify Component Sitemap

Map of the theme as wired today: **layout → section groups → templates → sections → blocks**, plus key global snippets.

Generated from JSON templates / section groups in the theme. Theme editor changes may diverge.

---

## Theme shell

```
layout/theme.liquid
├── snippets (head)
│   ├── meta-tags
│   ├── stylesheets / fonts / scripts
│   ├── theme-styles-variables
│   ├── color-palette
│   └── theme-editor (design mode only)
├── snippets/skip-to-content-link
├── snippets/chat-drawer
├── sections/header-group  ← global header
├── {{ content_for_layout }}  ← page template sections
├── sections/footer-group  ← global footer
└── global overlays
    ├── snippets/cart-drawer
    ├── snippets/theme-drawer
    ├── snippets/search-modal
    └── snippets/quick-add-modal (if quick add enabled)
```

**Password shell:** `layout/password.liquid` → `templates/password.json` → `sections/password` + `sections/password-footer`

**Gift card:** `templates/gift_card.liquid` (standalone Liquid template)

---

## Global: Header group

`sections/header-group.json`

| Order | Section | Blocks |
| --- | --- | --- |
| 1 | `header` | `_header-logo` (static), `_header-menu` (static) |

**Header-related snippets (not blocks):**

- `header-row`, `header-actions`, `header-sku-search`, `header-drawer`
- `search`, `localization-form`, `cart-bubble`
- `sku-search-product-data` (SKU search data)

---

## Global: Footer group

`sections/footer-group.json`

| Order | Section | Notes |
| --- | --- | --- |
| 1 | `colorway-rectangles` | Footer accent strip |
| 2 | `favrik-footer` | Custom Favrik footer (links, legal, logo) |

---

## Page templates

Every storefront page below also includes **header-group** + **footer-group** (except password / gift card).

### `/` — Home

`templates/index.json`

1. `collection-list`
   - `_collection-card` (static)
     - `_collection-card-image` (static)
     - `_collection-hero-button`
2. `product-list`
   - `_product-list-content` (static)
   - `_product-card` (static) → `_product-card-gallery`, `product-title`, `price`
3. `collection-image-trio`
4. `collection-image-duo`

---

### `/collections/{handle}` — Collection

`templates/collection.json`

1. `collection-header`
2. `main-collection`
   - `filters` (static)
   - `_product-card` (static) → `_product-card-gallery`, `product-title`, `price`

---

### `/collections` — List collections

`templates/list-collections.json`

1. `main-collection-list`
   - `group` → `text`
   - `_collection-card` (static) → `collection-title`, `_collection-card-image` (static)

---

### `/products/{handle}` — Product

`templates/product.json`

1. `product-information`
   - `disclosures`
   - `_product-media-gallery` (static)
   - `_product-details` (static)
     - `group` → `text`, `price`
     - `_divider`
     - `variant-picker`
     - `buy-buttons` → `quantity` (static), `add-to-cart` (static)
     - `text` ×2
     - `product-shipping-returns`
2. `product-recommendations`
   - `text`
   - `_product-card` (static) → `_product-card-gallery`, `product-title`, `price`

---

### `/cart` — Cart

`templates/cart.json`

1. `main-cart`
   - `_cart-title` (static)
   - `_cart-products` (static)
   - `_cart-summary` (static)
2. `product-list` (recommendations-style)
   - `_product-list-content` (static) → `_product-list-text`, `_product-list-button`
   - `_product-card` (static) → `_product-card-gallery`, `product-title`, `price`

---

### `/search` — Search

`templates/search.json`

1. `search-header`
   - `_heading` (static)
   - `_search-input` (static)
2. `search-results`
   - `filters` (static)
   - `_product-card` (static) → `_product-card-gallery`, `product-title`, `price`

---

### `/blogs/{blog}` — Blog index

`templates/blog.json`

1. `main-blog`
   - `text`
   - `_blog-post-card` (static)
     - `_heading` (static)
     - `_blog-post-info-text` (static)
     - `_blog-post-image` (static)

---

### `/blogs/{blog}/{article}` — Article

`templates/article.json`

1. `main-blog-post`
   - `text`
   - `_blog-post-info-text`
   - `image`
   - `_blog-post-content`

---

### `/pages/{handle}` — Pages

| Template | Route (typical) | Sections / blocks |
| --- | --- | --- |
| `page.json` | Default page | `main-page` → `text`, `page-content` |
| `page.about.json` | `/pages/about` | `main-page` → `text` ×2 |
| `page.contact.json` | `/pages/contact` | `main-page` → `text` ×2; `section` → `contact-form` → `contact-form-submit-button` |
| `page.locations.json` | `/pages/locations` | `main-page` → `text` ×2 |
| `page.privacy-policy.json` | `/pages/privacy-policy` | `main-page` → `text` ×2 |
| `page.terms-of-use.json` | `/pages/terms-of-use` | `main-page` → `text` ×2 |
| `page.returns-policy.json` | Returns policy page | `returns-policy-page` |

---

### `/404` — Not found

`templates/404.json`

1. `main-404` → `text` ×2, `button`
2. `product-list` → `_product-list-content` / `_product-card` (gallery, title, price)

---

### Password page

`templates/password.json` (uses `layout/password.liquid`)

1. `password` → `logo`, `text` ×2, `email-signup`
2. Footer via `password-footer` section (layout-level)

---

## Component inventory (theme files)

| Layer | Count | Path |
| --- | --- | --- |
| Layouts | 2 | `layout/` |
| Templates | 17 JSON + 1 Liquid | `templates/` |
| Sections | 46 | `sections/` |
| Blocks | 97 | `blocks/` |
| Snippets | 132 | `snippets/` |
| Config | `settings_schema.json`, `settings_data.json` | `config/` |

---

## Sections used in live templates / groups

`header`, `colorway-rectangles`, `favrik-footer`, `collection-list`, `product-list`, `collection-image-trio`, `collection-image-duo`, `collection-header`, `main-collection`, `main-collection-list`, `product-information`, `product-recommendations`, `main-cart`, `search-header`, `search-results`, `main-blog`, `main-blog-post`, `main-page`, `section`, `returns-policy-page`, `main-404`, `password`

---

## Sections available but not currently assigned

These exist in `sections/` and can be added in the theme editor, but are not in current template/group JSON:

- Marketing / content: `hero`, `slideshow`, `layered-slideshow`, `carousel`, `marquee`, `media-with-content`, `divider`, `logo`, `custom-liquid`
- Merchandising: `featured-product`, `featured-product-information`, `featured-blog-posts`, `product-hotspots`, `collection-links`, `quick-order-list`
- System / alternate: `header-announcements`, `footer`, `footer-utilities`, `cart-drawer-section`, `predictive-search`, `predictive-search-empty`, `section-rendering-product-card`, `password-footer`

---

## Route → template cheat sheet

| URL pattern | Template |
| --- | --- |
| `/` | `index` |
| `/collections` | `list-collections` |
| `/collections/{handle}` | `collection` |
| `/products/{handle}` | `product` |
| `/cart` | `cart` |
| `/search` | `search` |
| `/blogs/{blog}` | `blog` |
| `/blogs/{blog}/{article}` | `article` |
| `/pages/{handle}` | `page` or alternate (`page.about`, etc.) |
| `/404` | `404` |
| Password gate | `password` |
| Gift card | `gift_card` |

---

## Visual tree (storefront)

```
theme.liquid
│
├─ header-group
│  └─ header
│     ├─ _header-logo
│     ├─ _header-menu
│     └─ [snippets: header-actions, header-sku-search, localization…]
│
├─ MainContent (by template)
│  ├─ index ………… collection-list → product-list → collection-image-trio → collection-image-duo
│  ├─ collection … collection-header → main-collection (filters + product cards)
│  ├─ product ……… product-information → product-recommendations
│  ├─ cart …………… main-cart → product-list
│  ├─ search ……… search-header → search-results
│  ├─ blog / article
│  ├─ pages ……… main-page (+ contact form / returns-policy-page)
│  └─ 404 ………… main-404 → product-list
│
├─ footer-group
│  ├─ colorway-rectangles
│  └─ favrik-footer
│
└─ overlays: cart-drawer · theme-drawer · search-modal · quick-add-modal · chat-drawer
```
