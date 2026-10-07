'use strict';

const { randomUUID } = require('node:crypto');
const { ApiError, requireInteger, requireUuid } = require('./agenda-previews-admin-core');

const PDF_MIME_TYPE = 'application/pdf';
const PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalText(value, maxLength, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  if (normalized.length > maxLength) {
    throw new ApiError(422, 'invalid_field', `${fieldName} excede la longitud permitida.`);
  }
  return normalized || null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeFreebiePayload(payload, { partial = false } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const result = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (!partial || has('title')) {
    const title = String(source.title || '').trim();
    if (!title || title.length > 200) {
      throw new ApiError(422, 'invalid_title', 'El título es obligatorio y admite hasta 200 caracteres.');
    }
    result.title = title;
  }

  if (!partial || has('description')) {
    result.description = optionalText(source.description, 2000, 'description');
  }

  if (!partial || has('category')) {
    result.category = optionalText(source.category, 100, 'category');
  }

  if (!partial || has('sort_order')) {
    result.sort_order = requireInteger(source.sort_order ?? 100, 0, 1000000, 'sort_order');
  }

  if (!partial || has('is_active')) {
    result.is_active = partial ? Boolean(source.is_active) : false;
  }

  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(400, 'empty_update', 'No hay datos válidos para actualizar.');
  }

  return result;
}

function createSlug(title) {
  const base = slugify(title);
  if (!SLUG_PATTERN.test(base) || base.length < 2) {
    throw new ApiError(422, 'invalid_slug', 'No se pudo generar un identificador válido desde el título.');
  }
  return base.slice(0, 90);
}

function sanitizeUploadRequest(payload) {
  const resourceId = requireUuid(payload?.resource_id, 'resource_id');
  const kind = String(payload?.kind || '').trim().toLowerCase();
  const mimeType = String(payload?.mime_type || '').trim().toLowerCase();
  const size = requireInteger(payload?.file_size, 1, MAX_PDF_SIZE, 'file_size');

  if (!['pdf', 'thumbnail'].includes(kind)) {
    throw new ApiError(422, 'invalid_upload_kind', 'El tipo de archivo no es válido.');
  }
  if (kind === 'pdf' && mimeType !== PDF_MIME_TYPE) {
    throw new ApiError(422, 'invalid_pdf_type', 'Selecciona un archivo PDF válido.');
  }
  if (kind === 'thumbnail' && !PREVIEW_MIME_TYPES.has(mimeType)) {
    throw new ApiError(422, 'invalid_preview_type', 'La miniatura debe ser JPG, PNG o WebP.');
  }
  if (kind === 'thumbnail' && size > MAX_PREVIEW_SIZE) {
    throw new ApiError(422, 'preview_too_large', 'La miniatura no puede superar 5 MB.');
  }

  return { resourceId, kind, mimeType, size };
}

function extensionForMime(mimeType) {
  return {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }[mimeType];
}

function buildStoragePath(resourceId, kind, mimeType, version = randomUUID()) {
  const id = requireUuid(resourceId, 'resource_id');
  const extension = extensionForMime(mimeType);
  if (!extension) throw new ApiError(422, 'invalid_mime_type', 'El tipo de archivo no está permitido.');
  const folder = kind === 'thumbnail' ? 'previews' : 'freebies';
  return `${folder}/${id}/${version}.${extension}`;
}

module.exports = {
  MAX_PDF_SIZE,
  MAX_PREVIEW_SIZE,
  PDF_MIME_TYPE,
  PREVIEW_MIME_TYPES,
  buildStoragePath,
  createSlug,
  sanitizeFreebiePayload,
  sanitizeUploadRequest,
  slugify,
};
