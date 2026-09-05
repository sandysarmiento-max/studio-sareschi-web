const LEGACY_PRODUCT_SLUGS = {
  'producto-1784324569211': 'agenda-pediatrica-nina-a5',
  'producto-1784324354193': 'agenda-pediatrica-nino-a5',
  'producto-1783258443666': 'planner-dulce-compania-a5',
  'producto-1783701503073': 'diario-personal-mi-pandilla-a5',
  'producto-1782733712270': 'diario-devocional-a5',
  'producto-1784589824013': 'agenda-planner-2027-entre-flores-y-golondrinas',
  'producto-1781012233107': 'agenda-nina-y-cerezo-a5',
  'producto-1781113553678': 'agenda-nina-y-gatito-a5',
};

function getProductSlug(productOrCode) {
  const code =
    typeof productOrCode === 'string'
      ? productOrCode
      : String(productOrCode?.code || '');

  return LEGACY_PRODUCT_SLUGS[code] || code;
}

function getProductCodeFromSlug(slug) {
  const cleanSlug = String(slug || '');

  const match = Object.entries(LEGACY_PRODUCT_SLUGS)
    .find(([, prettySlug]) => prettySlug === cleanSlug);

  return match ? match[0] : cleanSlug;
}

module.exports = {
  LEGACY_PRODUCT_SLUGS,
  getProductSlug,
  getProductCodeFromSlug,
};