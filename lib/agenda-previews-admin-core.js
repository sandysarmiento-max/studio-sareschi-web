'use strict';

const BUCKET = 'agenda-previews';
const MAX_PAGES = 120;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseAdminEmails(rawValue) {
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAuthorizedAdmin(user, adminEmails) {
  if (user?.app_metadata?.role === 'admin') return true;
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(email && adminEmails.size > 0 && adminEmails.has(email));
}

function getBearerToken(req) {
  const match = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requireUuid(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new ApiError(400, 'invalid_uuid', `${fieldName} no es un UUID válido.`);
  }
  return normalized;
}

function optionalText(value, maxLength, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  if (normalized.length > maxLength) {
    throw new ApiError(422, 'invalid_field', `${fieldName} excede la longitud permitida.`);
  }
  return normalized || null;
}

function requireInteger(value, minimum, maximum, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(422, 'invalid_field', `${fieldName} no es válido.`);
  }
  return number;
}

function sanitizePreviewPayload(payload, { partial = false } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const result = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (!partial || has('slug')) {
    const slug = String(source.slug || '').trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 100) {
      throw new ApiError(422, 'invalid_slug', 'El slug no es válido.');
    }
    result.slug = slug;
  }

  if (!partial || has('title')) {
    const title = String(source.title || '').trim();
    if (!title || title.length > 200) {
      throw new ApiError(422, 'invalid_title', 'El título no es válido.');
    }
    result.title = title;
  }

  if (!partial || has('format')) {
    const format = String(source.format || '').trim();
    if (!format || format.length > 50) {
      throw new ApiError(422, 'invalid_format', 'El formato no es válido.');
    }
    result.format = format;
  }

  for (const field of ['width_mm', 'height_mm']) {
    if (!partial || has(field)) {
      const number = Number(source[field]);
      if (!Number.isFinite(number) || number <= 0 || number > 1000) {
        throw new ApiError(422, 'invalid_dimensions', `${field} no es válido.`);
      }
      result[field] = number;
    }
  }

  if (!partial || has('orientation')) {
    const orientation = String(source.orientation || '').trim().toLowerCase();
    if (!['portrait', 'landscape'].includes(orientation)) {
      throw new ApiError(422, 'invalid_orientation', 'La orientación no es válida.');
    }
    result.orientation = orientation;
  }

  if (!partial || has('total_product_pages')) {
    result.total_product_pages = requireInteger(
      source.total_product_pages,
      1,
      10000,
      'total_product_pages'
    );
  }

  if (!partial || has('buy_button_text')) {
    result.buy_button_text = optionalText(source.buy_button_text, 120, 'buy_button_text');
  }

  if (!partial || has('buy_url')) {
    const buyUrl = optionalText(source.buy_url, 2048, 'buy_url');
    if (buyUrl) {
      let parsed;
      try {
        parsed = new URL(buyUrl);
      } catch {
        throw new ApiError(422, 'invalid_buy_url', 'La URL de compra no es válida.');
      }
      if (parsed.protocol !== 'https:') {
        throw new ApiError(422, 'invalid_buy_url', 'La URL de compra debe usar HTTPS.');
      }
    }
    result.buy_url = buyUrl;
  }

  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(400, 'empty_update', 'No hay datos válidos para actualizar.');
  }

  return result;
}

function sanitizeImageMetadata(payload) {
  const mimeType = String(payload?.mime_type || '').trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ApiError(422, 'invalid_mime_type', 'El tipo de imagen no está permitido.');
  }

  const fileSize = requireInteger(payload?.file_size_bytes, 1, MAX_FILE_SIZE, 'file_size_bytes');
  const width = requireInteger(payload?.width_px, 1, 20000, 'width_px');
  const height = requireInteger(payload?.height_px, 1, 20000, 'height_px');
  const sha256 = String(payload?.sha256 || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new ApiError(422, 'invalid_sha256', 'El SHA-256 no es válido.');
  }

  return {
    original_filename: optionalText(payload?.original_filename, 500, 'original_filename'),
    mime_type: mimeType,
    width_px: width,
    height_px: height,
    file_size_bytes: fileSize,
    sha256,
  };
}

function storagePath(previewId, pageId, objectVersion) {
  return `${requireUuid(previewId, 'preview_id')}/${requireUuid(pageId, 'page_id')}/${requireUuid(
    objectVersion,
    'object_version'
  )}`;
}

function mapSupabaseError(error) {
  if (error instanceof ApiError) return error;
  const code = String(error?.code || '');
  if (code === '23505' || code === '40001') {
    return new ApiError(409, 'conflict', 'La operación entra en conflicto con el estado actual.');
  }
  if (code === 'P0002') {
    return new ApiError(404, 'not_found', 'La muestra o página no existe.');
  }
  if (code === '42501') {
    return new ApiError(403, 'forbidden', 'La operación no está autorizada.');
  }
  if (code === '23514' || code === '22P02' || code === '22023') {
    return new ApiError(422, 'validation_failed', error?.message || 'Los datos no son válidos.');
  }
  return new ApiError(500, 'internal_error', 'No se pudo completar la operación.');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = {
  ALLOWED_MIME_TYPES,
  ApiError,
  BUCKET,
  MAX_FILE_SIZE,
  MAX_PAGES,
  getBearerToken,
  isAuthorizedAdmin,
  json,
  mapSupabaseError,
  parseAdminEmails,
  requireInteger,
  requireUuid,
  sanitizeImageMetadata,
  sanitizePreviewPayload,
  storagePath,
};
