# Website updates — 31 August–3 September 2026

Here is a summary of the fixes and improvements completed tonight. Some changes are small visual details, while others fix mobile usability issues that may not be immediately noticeable.

## Header, menu and search

- Replaced the mobile menu icon with a three-line icon that matches the style of the other header icons.
- Adjusted the menu icon size so it sits more evenly in the mobile header.
- Made the mobile menu text the same size as the footer links.
- Tightened the spacing between mobile menu links to suit the smaller text.
- Stopped the page behind the mobile menu from being touched or scrolled while the menu is open.
- Stopped the page behind the search overlay from scrolling while search is open.
- Made the “Search by name or SKU” text smaller on mobile to match the footer link size.
- Improved mobile search keyboard behaviour so pressing Enter closes the keyboard without accidentally opening a product.
- Kept search suggestions visible after the mobile keyboard is closed.

## Customer account

- Added the customer account icon to the mobile header.
- Improved the account icon size and alignment on mobile.
- Made the mobile account panel text smaller and more consistent with the rest of the site.
- Removed the unwanted border and background from the account panel close button.
- Prevented an unwanted focus outline from flashing when drawers first open, while keeping keyboard focus support.

## Cart

- Made the cart opening and closing animation smoother while keeping it quick.
- Matched the cart header height to the main website header.
- Improved the alignment of product names, prices and images in the mobile cart.
- Fixed long product names so they wrap more naturally.
- Prevented prices from wrapping onto multiple lines.
- Made cart text sizes and weights more consistent.
- Improved the spacing and alignment of the quantity controls and remove button.
- Made the quantity number easier to read on mobile without causing unwanted phone zoom.
- Disabled the plus button when no more stock can be added.
- Made stock limits work correctly when the same product appears on more than one cart line.
- Changed “Estimated total” to the clearer “Subtotal” label.
- Changed the discount field placeholder to the simpler word “CODE”.
- Improved the discount field placeholder colour and focus appearance.
- Made the tax and shipping note smaller and easier to scan.
- Split longer tax and shipping information across separate lines.

## Collection filters

- Aligned the mobile filter panel with the normal page margins.
- Improved the size and alignment of the minimum and maximum price fields.
- Correctly centred the currency symbol inside the price fields.
- Simplified the filter close button and removed its unwanted border, background and shadow.
- Adjusted the filter close icon to better match the other interface icons.

## Product pages

- Replaced mobile image dots with a simple image counter.
- Made the image counter consistent across standard and featured product sections.
- Fixed mobile product images so they fully fill the image area without leaving gaps.
- Improved spacing inside the measurements and sizing guide.
- Made sizing guide headings clearer.
- Improved mobile colour option sizing so four options can fit across where space allows.
- Allowed longer colour names to wrap neatly instead of overflowing.
- Improved the way tax and shipping details are displayed.

## Product cards

- Made product prices slightly smaller so the product name remains the main focus.
- Improved product price weight and colour for clearer visual balance.
- Added separate responsive price sizing for desktop and mobile.

## Footer

- Removed the duplicate Instagram link from the footer.
- Kept Instagram available in the main header.
- Improved the mobile footer order so store information appears before the link columns.

## General mobile improvements

- Removed the grey tap flash that appeared when tapping buttons and links on mobile.
- Prevented mobile browsers from automatically zooming into standard form fields.
- Improved scroll locking across menus, search panels and drawers.
- Prevented scroll movement from passing through an open overlay to the page behind it.

## Additional updates — 3 September 2026

### Header, menu and search

- Fixed the mobile header disappearing when Search or Shop was opened after scrolling down the page.
- Kept the header fixed in the correct viewport position while either overlay is open.
- Prevented the website behind the Search and Shop overlays from scrolling.
- Prevented iPhones from zooming the page when the search input is focused, while retaining the smaller visual text size.
- Added a clear “No Matching Products” message when a search has no results.
- Changed both overlay backdrops from a brown tint to a balanced charcoal colour.
- Increased the mobile hamburger icon size.
- Replaced the custom account icon with the matching icon from the theme’s icon set.
- Matched the desktop account icon to the other desktop header icons at 22px.
- Kept the signed-out mobile account icon at 18px.
- Reduced the signed-in Google/Shopify avatar to 10px on mobile while preserving its 40px tap target.

### Product delivery banner

- Restored the free-shipping banner on mobile product pages.
- Removed persistent session dismissal so the banner appears again on each applicable product page.
- Made the banner scroll away naturally before the main header becomes sticky.
- Increased the banner’s vertical padding and improved its bottom spacing.
- Vertically centred the banner text and close icon.

### Cart

- Fixed the mobile discount-code keyboard state so exposed space shows the cart background rather than the website underneath.
- Kept the final mobile cart item’s bottom padding consistent with the other cart items.
- Standardised mobile checkout-summary spacing to 12px between the discount area, separators, subtotal, free-shipping status, tax note and checkout button.
- Reduced the mobile checkout button height slightly to 44px.
- Appended “PREORDER” to preorder product titles in both the cart drawer and cart page.

### Product pages

- Changed the purchase button to “ADD PREORDER” when the selected variant has Shopify-managed inventory at zero or below and “Continue selling when out of stock” is enabled.
- Made the preorder button label update correctly when the selected variant changes.
- Added a “Preorder Dispatch” line directly beneath Material using `custom.preorder_dispatch_date`.
- Formatted preorder dispatch dates as `DD/MM/YY` and kept the typography consistent with the Material line.

### Product cards and badges

- Reduced the size, height, padding and font weight of the SALE and FAVRIK MADE badges, with additional reductions on mobile.
- Added a PREORDER badge for products where `custom.preorder` is true.
- Corrected the preorder metafield lookup so the badge renders reliably.
- Replaced hardcoded badge backgrounds with global shop metafields:
  - `custom.sale_badge_color`
  - `custom.favrik_made_badge_color`
  - `custom.preorder_badge_color`

### About page

- Removed the Favrik logo that was overlaid on the About page image on desktop and mobile.
- Made the About page image fill the available mobile viewport height beneath the header.
