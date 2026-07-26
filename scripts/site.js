const searchInput = document.querySelector("[data-sop-search]");
const searchStatus = document.querySelector("[data-search-status]");
const cards = Array.from(document.querySelectorAll("[data-search-card]"));

function normalize(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

if (searchInput && cards.length) {
  searchInput.addEventListener("input", () => {
    const query = normalize(searchInput.value);
    let visible = 0;
    cards.forEach((card) => {
      const matches = !query || normalize(card.dataset.searchCard).includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (searchStatus) searchStatus.textContent = `พบ ${visible} คู่มือ`;
  });
}

async function prepareImagesForPrint() {
  const images = Array.from(document.images);
  images.forEach((image) => { image.loading = "eager"; });
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }
    if (typeof image.decode === "function") {
      try { await image.decode(); } catch {}
    }
  }));
}

window.addEventListener("beforeprint", () => {
  document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
});

document.querySelectorAll("[data-print]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    await prepareImagesForPrint();
    button.disabled = false;
    window.print();
  });
});
