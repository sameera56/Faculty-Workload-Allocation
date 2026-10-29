const { sendError } = require('../utils/http');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 'Request body contains invalid JSON.', 400);
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return sendError(res, 'A record with one of these unique values already exists.', 409);
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return sendError(res, 'A referenced record does not exist.', 400);
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return sendError(res, 'This record is in use and cannot be deleted.', 409);
  }
  console.error(error);
  return sendError(res, 'An unexpected server error occurred.', 500);
}

module.exports = errorHandler;
