const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { getProductSlug, getProductCodeFromSlug } = require('./product-slugs');

const SITE_URL = 'https://www.studio-sareschi.com';
const WHATSAPP_NUMBER = '51969095636';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function compactText(value, max = 160) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function validSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

async function callSupabase(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase no configurado.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function publicImageUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  if (
    raw.startsWith('https://') ||
    raw.startsWith('http://') ||
    raw.startsWith('data:image/')
  ) {
    return raw;
  }

  if (raw.startsWith('/storage/v1/object/public/')) {
    return `${SUPABASE_URL}${raw}`;
  }

  if (raw.startsWith('storage/v1/object/public/')) {
    return `${SUPABASE_URL}/${raw}`;
  }

  if (raw.startsWith('paid-previews/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/${raw}`;
  }

  return raw;
}

function validHotmartUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    const allowed =
      host === 'hotmart.com' ||
      host.endsWith('.hotmart.com') ||
      host === 'hotm.art' ||
      host.endsWith('.hotm.art');

    return url.protocol === 'https:' && allowed ? url.toString() : '';
  } catch {
    return '';
  }
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.end(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Producto no encontrado | Studio Sareschi</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="section">
    <div class="container">
      <h1>Producto no encontrado</h1>
      <p>Esta plantilla no está disponible o la dirección no es correcta.</p>
      <a class="btn btn-primary" href="/pdfs/">Ver todas las plantillas</a>
    </div>
  </main>
</body>
</html>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const slug = validSlug(req.query?.slug);
  const productCode = getProductCodeFromSlug(slug);

  if (!slug) {
    return notFound(res);
  }

  try {
    const columns =
      'id,code,title,description,price_yape_pe,price_paypal_usd,hotmart_url,main_image_url,preview_01_url,preview_02_url,preview_03_url,active,sort_order';

    const products = await callSupabase(
      `/rest/v1/paid_products?select=${encodeURIComponent(columns)}&code=eq.${encodeURIComponent(productCode)}&active=eq.true&limit=1`
    );

    const product = Array.isArray(products) ? products[0] : null;

    if (!product) {
      return notFound(res);
    }

    const related = await callSupabase(
      `/rest/v1/paid_products?select=${encodeURIComponent(
        'code,title,main_image_url,price_yape_pe'
      )}&active=eq.true&code=neq.${encodeURIComponent(
        slug
      )}&order=sort_order.asc&limit=4`
    );

    const title = String(product.title || '').trim();
    const description = String(product.description || '').trim();

    const canonical =
      `${SITE_URL}/plantillas/${encodeURIComponent(getProductSlug(product))}/`;

    const mainImage = publicImageUrl(product.main_image_url);

    const previews = [
      product.preview_01_url,
      product.preview_02_url,
      product.preview_03_url,
    ]
      .map(publicImageUrl)
      .filter(Boolean);

    const hotmartUrl = validHotmartUrl(product.hotmart_url);

    const pricePen = Number(product.price_yape_pe || 0);
    const priceUsd = Number(product.price_paypal_usd || 0);

    const whatsappText = encodeURIComponent(
      `Hola, quiero comprar “${title}”. ¿Me compartes los datos para realizar el pago?`
    );

    const whatsappUrl =
      `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

    const metaDescription =
      compactText(
        description ||
          `${title}. Plantilla digital de Studio Sareschi para agendas, planners y papelería creativa.`
      );

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description: metaDescription,
      image: [mainImage, ...previews].filter(Boolean),
      url: canonical,
      brand: {
        '@type': 'Brand',
        name: 'Studio Sareschi',
      },
    };

    if (pricePen > 0) {
      schema.offers = {
        '@type': 'Offer',
        priceCurrency: 'PEN',
        price: pricePen.toFixed(2),
        availability: 'https://schema.org/InStock',
        url: canonical,
      };
    }

    const schemaJson = JSON.stringify(schema).replace(/</g, '\\u003c');

    const previewHtml = previews.length
      ? previews
          .map(
            (url, index) => `
              <figure class="product-sale__thumb">
                <img
                  src="${escapeHtml(url)}"
                  alt="Vista ${index + 1} de ${escapeHtml(title)}"
                  loading="lazy"
                >
              </figure>`
          )
          .join('')
      : '';

    const relatedHtml = Array.isArray(related)
      ? related
          .map((item) => {
            const relatedImage = publicImageUrl(item.main_image_url);
            const relatedPrice = Number(item.price_yape_pe || 0);

            return `
              <a
                class="product-sale__related-card"
                href="/plantillas/${encodeURIComponent(getProductSlug(item))}/"
              >
                <div class="product-sale__related-image">
                  ${
                    relatedImage
                      ? `<img src="${escapeHtml(
                          relatedImage
                        )}" alt="${escapeHtml(item.title)}" loading="lazy">`
                      : ''
                  }
                </div>

                <strong>${escapeHtml(item.title)}</strong>

                ${
                  relatedPrice > 0
                    ? `<span>S/ ${relatedPrice.toFixed(2)}</span>`
                    : ''
                }
              </a>`;
          })
          .join('')
      : '';

    res.statusCode = 200;

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=86400'
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    res.end(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escapeHtml(title)} | Studio Sareschi</title>

  <meta
    name="description"
    content="${escapeHtml(metaDescription)}"
  >

  <link
    rel="canonical"
    href="${escapeHtml(canonical)}"
  >

  <meta
    property="og:type"
    content="product"
  >

  <meta
    property="og:title"
    content="${escapeHtml(title)}"
  >

  <meta
    property="og:description"
    content="${escapeHtml(metaDescription)}"
  >

  <meta
    property="og:url"
    content="${escapeHtml(canonical)}"
  >

  ${
    mainImage
      ? `<meta property="og:image" content="${escapeHtml(mainImage)}">`
      : ''
  }

  <link
    rel="preconnect"
    href="https://fonts.googleapis.com"
  >

  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin
  >

  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  >

  <link
    rel="stylesheet"
    href="/styles.css"
  >

  <script type="application/ld+json">${schemaJson}</script>

  <style>
    .product-sale {
      padding: 38px 0 60px;
    }

    .product-sale__breadcrumb {
      margin-bottom: 24px;
      color: #756a72;
      font-size: 13px;
    }

    .product-sale__breadcrumb a {
      color: inherit;
    }

    .product-sale__hero {
      display: grid;
      grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
      gap: 38px;
      align-items: start;
    }

    .product-sale__main-image {
      overflow: hidden;
      border: 1px solid #eedde5;
      border-radius: 24px;
      background: #faf5f7;
    }

    .product-sale__main-image img {
      display: block;
      width: 100%;
      height: auto;
    }

    .product-sale__thumbs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }

    .product-sale__thumb {
      margin: 0;
      overflow: hidden;
      border: 1px solid #eedde5;
      border-radius: 14px;
      background: #faf5f7;
    }

    .product-sale__thumb img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
    }

    .product-sale__info h1 {
      margin: 0 0 16px;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 1.05;
    }

    .product-sale__description {
      color: #655b62;
      font-size: 16px;
      line-height: 1.7;
      white-space: pre-line;
    }

    .product-sale__prices {
      display: grid;
      gap: 8px;
      margin: 24px 0;
      padding: 18px;
      border: 1px solid #eedde5;
      border-radius: 18px;
      background: #fffafb;
    }

    .product-sale__prices strong {
      font-size: 20px;
    }

    .product-sale__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .product-sale__note {
      margin-top: 14px;
      color: #7c7077;
      font-size: 12px;
      line-height: 1.5;
    }

    .product-sale__related {
      margin-top: 54px;
    }

    .product-sale__related h2 {
      margin-bottom: 18px;
    }

    .product-sale__related-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .product-sale__related-card {
      display: grid;
      gap: 9px;
      color: inherit;
      text-decoration: none;
    }

    .product-sale__related-image {
      overflow: hidden;
      aspect-ratio: 1 / 1.1;
      border: 1px solid #eedde5;
      border-radius: 16px;
      background: #faf5f7;
    }

    .product-sale__related-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .product-sale__related-card strong {
      font-size: 13px;
      line-height: 1.35;
    }

    .product-sale__related-card span {
      color: #c43b78;
      font-size: 13px;
      font-weight: 800;
    }

    @media (max-width: 760px) {
      .product-sale__hero {
        grid-template-columns: 1fr;
        gap: 26px;
      }

      .product-sale__related-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>

<body>

  <header class="site-header">
    <div class="container nav-wrap">

      <a class="brand" href="/">
        Studio Sareschi
      </a>

      <nav aria-label="Principal">
        <ul class="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/pdfs/">Plantillas</a></li>
          <li><a href="/acceso/">Acceso</a></li>
        </ul>
      </nav>

    </div>
  </header>


  <main class="product-sale">

    <div class="container">

      <nav class="product-sale__breadcrumb" aria-label="Ruta">
        <a href="/">Inicio</a>
        ·
        <a href="/pdfs/">Plantillas</a>
        ·
        <span>${escapeHtml(title)}</span>
      </nav>


      <section class="product-sale__hero">

        <div>

          ${
            mainImage
              ? `
                <div class="product-sale__main-image">
                  <img
                    src="${escapeHtml(mainImage)}"
                    alt="${escapeHtml(title)}"
                  >
                </div>`
              : ''
          }

          ${
            previewHtml
              ? `<div class="product-sale__thumbs">${previewHtml}</div>`
              : ''
          }

        </div>


        <div class="product-sale__info">

          <p class="eyebrow">
            PLANTILLA DIGITAL
          </p>

          <h1>${escapeHtml(title)}</h1>

          <div class="product-sale__description">
            ${escapeHtml(description)}
          </div>


          <div class="product-sale__prices">

            ${
              pricePen > 0
                ? `<strong>S/ ${pricePen.toFixed(2)}</strong>
                   <span>Compra directa con Yape</span>`
                : ''
            }

            ${
              priceUsd > 0
                ? `<strong>US$ ${priceUsd.toFixed(2)}</strong>
                   <span>Compra directa con PayPal</span>`
                : ''
            }

          </div>


          <div class="product-sale__actions">

            <a
              class="btn btn-primary"
              href="${escapeHtml(whatsappUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Comprar por WhatsApp
            </a>

            ${
              hotmartUrl
                ? `
                  <a
                    class="btn btn-secondary"
                    href="${escapeHtml(hotmartUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Comprar en Hotmart
                  </a>`
                : ''
            }

          </div>

          <p class="product-sale__note">
            Producto digital. No se envía ningún producto físico.
            El precio en Hotmart puede variar por cargos de la plataforma.
          </p>

        </div>

      </section>


      ${
        relatedHtml
          ? `
            <section class="product-sale__related">
              <p class="eyebrow">TAMBIÉN TE PUEDE GUSTAR</p>
              <h2>Otros diseños de Studio Sareschi</h2>

              <div class="product-sale__related-grid">
                ${relatedHtml}
              </div>
            </section>`
          : ''
      }

    </div>

  </main>


  <footer class="site-footer">
    <div class="container site-footer__content">
      <p>© ${new Date().getFullYear()} Studio Sareschi</p>
      <a href="/libro-de-reclamaciones/">
        Libro de Reclamaciones
      </a>
    </div>
  </footer>

</body>
</html>`);
  } catch (error) {
    console.error(error);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    res.end(`
      <h1>No se pudo cargar el producto</h1>
      <p>Intenta nuevamente en unos minutos.</p>
    `);
  }
};