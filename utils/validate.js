const validator = require('validator');

function validateEmail(email) {
  return Boolean(email) && validator.isEmail(String(email));
}

function validatePassword(pwd) {
  return Boolean(pwd) && String(pwd).length >= 8;
}

function sanitizeString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

module.exports = {
  validateEmail,
  validatePassword,
  sanitizeString
};
