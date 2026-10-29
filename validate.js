const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({
      success: false,
      error: { message: 'Please correct the highlighted input.', details: result.array() }
    });
  }
  next();
}

module.exports = validate;
