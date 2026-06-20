/**
 * shop.jinja.js
 * Product grid rendering + quick-add logic.
 * Depends on: basket.jinja.js (must be loaded first)
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const API_URL = "https://staging-api.yarnandmoggy.co.uk";

// Map colour names to hexcodes
const COLOURMAP = {
  pistachio: "#2dbb90",
  strawberry: "#fc95b0",
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let allProducts = [];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * How many of a given product/variant are already in the basket?
 */
function getBasketQty(productSlug, variantName = null) {
  const basket = typeof getBasket === "function" ? getBasket() : {};
  const itemKey = variantName ? `${productSlug}:${variantName}` : productSlug;
  return basket[itemKey]?.quantity ?? 0;
}

// ─── CARD RENDERING ───────────────────────────────────────────────────────────

function createProductCard(product) {
  const imgUrl = transformImageUrl(product.thumbnail_url);
  const price = (product.price_pence / 100).toFixed(2);
  const productUrl = `/products.html?product-id=${product.slug}`;
  const hasVariants = product.variants && product.variants.length > 0;
  const tagline = product.tagline || null;

  let totalAvailable = 0;
  let variantHtml = "";

  if (hasVariants) {
    variantHtml = product.variants
      .map((v) => {
        const inBasket = getBasketQty(product.slug, v.name);
        const available = Math.max(0, v.quantity - inBasket);
        totalAvailable += available;

        const isVarOutOfStock = available <= 0;
        const colour = v.name.split(" ")[0].toLowerCase();

        return `
          <button class="variant-dot ${isVarOutOfStock ? "disabled" : ""}"
                  title="${v.name}${isVarOutOfStock ? " (No more available)" : ""}"
                  style="background-color: ${COLOURMAP[colour] || colour};"
                  ${isVarOutOfStock ? "disabled" : ""}
                  onclick="event.preventDefault(); selectVariantAndAdd('${product.slug}', '${v.name}')">
          </button>
        `;
      })
      .join("");
  } else {
    const inBasket = getBasketQty(product.slug);
    totalAvailable = Math.max(0, product.quantity - inBasket);
  }

  const isOutOfStock = totalAvailable <= 0;
  const isLastOne = totalAvailable === 1;

  return `
    <article class="shop-item" data-slug="${product.slug}" id="card-${product.slug}">
      <a href="${productUrl}" class="shop-item-link" style="text-decoration: none; color: inherit; display: block;">
        <div class="shop-img-container ${isOutOfStock ? "out-of-stock" : ""}">
          <img src="${imgUrl}" alt="${product.name}" loading="lazy">

          ${hasVariants ? `
            <div class="variant-popover" id="popover-${product.slug}">
              <p>Pick a colour:</p>
              <div class="variant-dots-grid">${variantHtml}</div>
              <button class="close-popover"
                onclick="event.preventDefault(); toggleVariantPicker('${product.slug}', false)">&#x2715;</button>
            </div>
          ` : ""}

          ${isOutOfStock ? `
            <span class="stock-badge">${product.quantity > 0 ? "In Basket" : "Sold Out"}</span>
          ` : isLastOne ? `
            <span class="stock-badge last-one">Last one!</span>
          ` : ""}

          <button class="quick-add"
                  ${isOutOfStock ? "disabled" : ""}
                  onclick="event.preventDefault(); handleQuickAdd('${product.slug}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
        <div class="shop-item-info">
          <h3>${product.name}</h3>
          ${tagline ? `<h4>${tagline}</h4>` : ""}
          <p class="price">&pound;${price}</p>
        </div>
      </a>
    </article>
  `;
}

/**
 * Re-renders a single card in place.
 * This is the onSuccess hook target — pass it directly to addToBasket.
 * Mutates the elements
 */
function refreshProductCard(slug) {
  const product = allProducts.find((p) => p.slug === slug);
  const card = document.getElementById(`card-${slug}`);
  if (!product || !card) return;

  // Recalculate availability
  const hasVariants = product.variants?.length > 0;
  let totalAvailable = 0;

  if (hasVariants) {
    // Update each variant dot's disabled state
    product.variants.forEach((v) => {
      const inBasket = getBasketQty(product.slug, v.name);
      const available = Math.max(0, v.quantity - inBasket);
      totalAvailable += available;

      const dot = card.querySelector(`[title^="${v.name}"]`);
      if (dot) {
        dot.disabled = available <= 0;
        dot.classList.toggle("disabled", available <= 0);
        dot.title = `${v.name}${available <= 0 ? " (No more available)" : ""}`;
      }
    });
  } else {
    const inBasket = getBasketQty(product.slug);
    totalAvailable = Math.max(0, product.quantity - inBasket);
  }

  const isOutOfStock = totalAvailable <= 0;
  const isLastOne = totalAvailable === 1;
  const imgContainer = card.querySelector(".shop-img-container");
  const badge = card.querySelector(".stock-badge");
  const quickAdd = card.querySelector(".quick-add");

  imgContainer?.classList.toggle("out-of-stock", isOutOfStock);
  quickAdd && (quickAdd.disabled = isOutOfStock);

  // Update or insert/remove the stock badge
  if (isOutOfStock) {
    if (!badge) {
      const span = document.createElement("span");
      span.className = "stock-badge";
      span.textContent = product.quantity > 0 ? "In Basket" : "Sold Out";
      imgContainer?.appendChild(span);
    } else {
      badge.classList.remove("last-one");
      badge.textContent = product.quantity > 0 ? "In Basket" : "Sold Out";
    }
  } else if (isLastOne) {
    if (!badge) {
      const span = document.createElement("span");
      span.className = "stock-badge last-one";
      span.textContent = "Last one!";
      imgContainer?.appendChild(span);
    } else {
      badge.className = "stock-badge last-one";
      badge.textContent = "Last one!";
    }
  } else if (badge) {
    badge.remove();
  }
}

// ─── QUICK ADD INTERACTIONS ───────────────────────────────────────────────────

function handleQuickAdd(slug) {
  const product = allProducts.find((p) => p.slug === slug);
  if (!product) return;

  const card = document.getElementById(`card-${slug}`);
  const popover = card?.querySelector(`#popover-${slug}`);

  if (popover) {
    // Has variants — show the colour picker popover
    toggleVariantPicker(product.slug, true);
  } else {
    // No variants — add directly, refresh card on success
    addToBasket(product, 1, null, (p) => refreshProductCard(p.slug));
  }
}

function selectVariantAndAdd(slug, variantName) {
  const product = allProducts.find((p) => p.slug === slug);
  if (!product) return;

  addToBasket(product, 1, variantName, (p) => {
    toggleVariantPicker(p.slug, false);
    refreshProductCard(p.slug);
  });
}

function toggleVariantPicker(slug, show) {
  const popover = document.getElementById(`popover-${slug}`);
  if (popover) popover.classList.toggle("visible", show);
}

// ─── DATA FETCHING + INFINITE SCROLL ─────────────────────────────────────────

async function fetchProducts(grid, cursor = "") {
  const url = cursor
    ? `${API_URL}/products?cursor=${cursor}`
    : `${API_URL}/products`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    allProducts = [...allProducts, ...data.products];
    grid.insertAdjacentHTML(
      "beforeend",
      data.products.map(createProductCard).join("")
    );
    grid.dataset.nextCursor = data.next_cursor || "";
    return data.next_cursor;
  } catch (err) {
    console.error("Failed to load products", err);
    alert(`error: ${err}`);
    return null;
  }
}

async function initShop() {
  const grid = document.getElementById("product-grid");
  const sentinel = document.getElementById("load-more-sentinel");
  const loading = document.getElementById("shop-loading");
  if (!grid || !sentinel) return;

  await fetchProducts(grid);
  if (loading) loading.style.display = "none";

  const shopHeader = document.getElementById("shop-header");
  if (shopHeader) shopHeader.classList.add("visible");

  const observer = new IntersectionObserver(
    async (entries) => {
      if (entries[0].isIntersecting && grid.dataset.nextCursor) {
        const next = await fetchProducts(grid, grid.dataset.nextCursor);
        if (!next) observer.unobserve(sentinel);
      }
    },
    { rootMargin: "200px" }
  );

  observer.observe(sentinel);
}

// listen for basket changes
document.addEventListener("basketItemRemoved", ({ detail }) => {
  refreshProductCard(detail.slug);
});
