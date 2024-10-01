const cfg = require('../config');
const UserModel = require('../models/user');

/**
 * Функция проверки белого списка
 * @param {Object} req
 * @param {Object} res
 * @param {Object} next
 * @param {Array|String} roles Роли, которым доступно действие
 * @returns {Object}
 */
const verifyAccount = async (req, res, next,) => {
  const accountId = req.body.account_id;
  const account = req.body.account;

  if (accountId && account) {
    const user = await UserModel.model.findOne({ login: accountId, whiteList: account, authType: 'WhiteList' });

    if (user) {
      return next();
    }
  }

  return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' });
};

const whiteListAuth = {
  verifyAccount
};

module.exports = whiteListAuth;