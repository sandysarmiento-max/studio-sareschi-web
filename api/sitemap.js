const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const { getProductSlug } = require('./product-slugs');

const SITE_URL = 'https://www.studio-sareschi.com';

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function getProducts() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase no configurado.');
  }

  const columns = encodeURIComponent(
    'code,active,updated_at'
  );

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/paid_products?select=${columns}&active=eq.true&order=sort_order.asc`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function urlEntry(loc, lastmod = '') {
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
  </url>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  try {
    const products = await getProducts();

    const urls = [
      urlEntry(`${SITE_URL}/`),
      urlEntry(`${SITE_URL}/pdfs/`),

      ...products.map((product) => {
        const slug = getProductSlug(product);

        const lastmod = product.updated_at
          ? new Date(product.updated_at).toISOString()
          : '';

        return urlEntry(
          `${SITE_URL}/plantillas/${encodeURIComponent(slug)}/`,
          lastmod
        );
      }),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      'application/xml; charset=utf-8'
    );

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=86400'
    );

    res.end(xml);
  } catch (error) {
    console.error(error);

    res.statusCode = 500;
    res.setHeader(
      'Content-Type',
      'text/plain; charset=utf-8'
    );

    res.end('No se pudo generar el sitemap.');
  }
};