const jwt = require('jsonwebtoken');
const cfg = require('../config');
const UserModel = require('../models/user');

/**
 * Функция проверки роли
 * @param {String} role - ИД обьекта
 * @param {Array} roles - обьект со данными
 * @returns {Object}
 */
const verifyRole = (role, roles) => {
  if (roles.length && !roles.includes(role)) {
    return false;
  }

  return true
}

/**
 * Функция проверки токена
 * @param {Object} req
 * @param {Object} res
 * @param {Object} next
 * @param {Array|String} roles Роли, которым доступно действие
 * @returns {Object}
 */
const verifyToken = (req, res, next, roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  if (req.headers.authorization && req.headers.authorization.indexOf('Basic ') === 0 && req.user) {
    if (!verifyRole(req.user.role, roles)) {
      return res.status(401).send({
        status: 'ERROR',
        message: 'Unauthorized'
      });
    }

    return next();
  }

  const token = req.headers['x-access-token'];

  if (!token) {
    return res.status(403).send({ message: 'No token provided!' });
  }

  jwt.verify(token, cfg.secret, async (err, decoded) => {
    if (err) {
      return res.status(401).send({
        status: 'ERROR',
        message: 'Unauthorized'
      });
    }

    const user = await UserModel.model.findOne({'_id' : decoded.userId});

    if (!verifyRole(user.role, roles)) {
      return res.status(401).send({
        status: 'ERROR',
        message: 'Unauthorized'
      });
    }

    req.user = user;

    next();
  });
};

const authJwt = {
  verifyToken
};

module.exports = authJwt;