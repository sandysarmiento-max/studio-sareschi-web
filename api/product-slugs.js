const LEGACY_PRODUCT_SLUGS = {
  'producto-1784324569211': 'agenda-pediatrica-nina-a5',
  'producto-1784324354193': 'agenda-pediatrica-nino-a5',
  'producto-1783258443666': 'planner-dulce-compania-a5',
  'producto-1783701503073': 'diario-personal-mi-pandilla-a5',
  'producto-1782733712270': 'diario-devocional-a5',
  'producto-1784589824013': 'agenda-planner-2027-entre-flores-y-golondrinas',
  'producto-1781012233107': 'agenda-nina-y-cerezo-a5',
  'producto-1781113553678': 'agenda-nina-y-gatito-a5',

  'producto-1781274621864': 'agenda-nina-cerezo-y-perrito-a5',
  'producto-1782511555209': 'agenda-2027-momentos-felices',
  'producto-1781274353365': 'agenda-en-la-playa-a5',
  'producto-1776796938580': 'agenda-garfield-2027',
  'producto-1776797260604': 'agenda-pinguino',
  'producto-1780848893720': 'agenda-stitch-a5',
  'producto-1775757824835': 'agenda-acuarela-2027-a5',
  'producto-1777915676018': 'plantilla-porta-post-it',
  'producto-1778015248030': 'portadas-a5-pack-1',
  'producto-1780862640912': 'agenda-capibara-1-a5',
  'producto-1780928669057': 'agenda-2027-7-dias-006',
  'producto-1776796550022': 'agenda-diy-a5',
  'producto-1776800004326': 'mini-escapes-para-tu-mente',
  'producto-1775864626415': 'planner-pokemon-2027-a5',
  'producto-1775864828142': 'planner-rosa-2027-a5',
  'producto-1775783539390': 'agenda-dog-cat-2027-a5',
  'producto-1775865260680': 'agenda-capibara-2-a5',
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