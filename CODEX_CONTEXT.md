# Codex Fast Context

Use this file to get oriented quickly and avoid spending tokens rediscovering the theme structure.

## Theme Shape

- `templates/*.json`: page composition and section settings for each template
- `sections/*.liquid`: section logic, schema, and section-scoped CSS
- `blocks/*.liquid`: reusable block logic/settings used inside sections
- `snippets/*.liquid`: shared rendering helpers and shared style variable output
- `assets/base.css`: global theme CSS and cross-section overrides
- `config/settings_data.json`: current theme settings values
- `config/settings_schema.json`: theme setting definitions

## First Places To Check

- Homepage layout: [templates/index.json](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/templates/index.json)
- Header behavior/layout: [sections/header.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/header.liquid)
- Header logo rendering: [blocks/_header-logo.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/blocks/_header-logo.liquid)
- Product card markup: [snippets/product-card.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/product-card.liquid)
- Product card media: [snippets/card-gallery.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/card-gallery.liquid)
- Collection cards: [snippets/collection-card.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/collection-card.liquid)
- Collection list section: [sections/collection-list.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/collection-list.liquid)
- Font loading: [snippets/fonts.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/fonts.liquid)
- Theme typography variables: [snippets/theme-styles-variables.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/theme-styles-variables.liquid)
- Global shared CSS overrides: [assets/base.css](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/assets/base.css)

## Current Customizations

- Product/listing cards were normalized to equal height with central crop in [assets/base.css](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/assets/base.css).
- Product card media is currently forced taller via `--gallery-aspect-ratio: 2 / 3`.
- Header logo falls back to `assets/favrik_logo.png` in [blocks/_header-logo.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/blocks/_header-logo.liquid) when no Shopify admin logo is set.
- Mobile header logo placement was moved left in [sections/header.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/header.liquid).
- Body font is overridden to `Zalando Sans Expanded` via [snippets/fonts.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/fonts.liquid) and [snippets/theme-styles-variables.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/theme-styles-variables.liquid).
- Homepage has a custom `collection_list_showcase` section in [templates/index.json](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/templates/index.json).
- Homepage collection showcase is set to the collection handles `fw2026` and `on-sale`.

## Fast Routing By Task

- Change homepage section order/content:
  [templates/index.json](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/templates/index.json)
- Change hero behavior or hero media rendering:
  [sections/hero.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/hero.liquid)
- Change homepage featured products:
  [templates/index.json](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/templates/index.json) and [sections/product-list.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/product-list.liquid)
- Change collection showcase cards:
  [templates/index.json](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/templates/index.json), [sections/collection-list.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/collection-list.liquid), [snippets/collection-card.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/collection-card.liquid)
- Change product card size/crop/height:
  [assets/base.css](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/assets/base.css), [snippets/product-card.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/product-card.liquid), [snippets/card-gallery.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/card-gallery.liquid)
- Change header spacing, alignment, sticky behavior:
  [sections/header.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/sections/header.liquid)
- Change logo asset or fallback behavior:
  [assets/favrik_logo.png](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/assets/favrik_logo.png), [blocks/_header-logo.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/blocks/_header-logo.liquid)
- Change body font or type tokens:
  [snippets/fonts.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/fonts.liquid), [snippets/theme-styles-variables.liquid](/Users/russell/Documents/Client%20Projects/favrik-shopify-webstore/snippets/theme-styles-variables.liquid)

## Lowest-Token Workflow

1. Start in the relevant `templates/*.json` file to see which section/block is actually active.
2. Open the matching `sections/*.liquid` file to inspect schema, markup, and local CSS.
3. If the section uses reusable cards/media, inspect the connected `blocks/*.liquid` or `snippets/*.liquid`.
4. Only open `assets/base.css` when behavior looks shared across multiple sections.
5. Run `shopify theme check` after edits.

## Useful Repo Facts

- Homepage hero currently has no real image configured and falls back to Shopify placeholder media unless changed in `templates/index.json`.
- The repo does not expose store data for products/collections beyond handles referenced in template JSON.
- Many visual changes can be done entirely in template JSON settings without touching Liquid logic.
