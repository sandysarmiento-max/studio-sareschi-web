'use strict';

const paidProductsHandler = require('../../lib/paid-products-admin-handler');
const agendaPreviewsHandler = require('../../lib/agenda-previews-admin-handler');

const HANDLERS = Object.freeze({
  'paid-products': paidProductsHandler,
  'agenda-previews': agendaPreviewsHandler,
});

function getHandlerName(req) {
  const value = req?.query?.handler;
  return typeof value === 'string' ? value : '';
}

function createAdminDispatcher(handlers = HANDLERS) {
  return async function adminDispatcher(req, res) {
    const handler = handlers[getHandlerName(req)];
    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Ruta administrativa no encontrada.' }));
    }

    return handler(req, res);
  };
}

module.exports = createAdminDispatcher();
module.exports._test = {
  createAdminDispatcher,
  getHandlerName,
};
