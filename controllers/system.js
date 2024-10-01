const SystemModel = require('../models/system');
const ObjectId = require('mongodb').ObjectId;
const { getPagination, prepareSearchParams, stringify } = require('../utils');
const cfg = require('../config');
const CryptoJS = require('crypto-js');
const logger = require('../middlewares/logger');

/**
 * Получение информации о системе 
 * @param {Object} req
 * @param {Object} res
 */
const getSystem = async function (req, res) {
  const id = req.params.id;

  try {
    const system = await SystemModel.model.findOne({ '_id': new ObjectId(id) });

    if (system) {
      res.send(system);
    } else {
      logger.info(`Метод getSystem - Обьект с кодом ${id} не найден`);
      res.status(400).send({ status: 'ERROR', message: `Обьект с кодом ${id} не найден` });
    }

  } catch (error) {
    logger.error(`Метод getSystem id=${id} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Cоздание системы
 * @param {Object} req
 * @param {Object} res
 */
const createSystem = async function (req, res) {
  const name = req.body.name;
  const type = req.body.type;
  const UserId = req.body.UserId;
  const ResponsibleFIO = req.body.ResponsibleFIO;
  const ResponsibleEmail = req.body.ResponsibleEmail;
  const ResponsiblePhone = req.body.ResponsiblePhone;
  const WSUrlBase = req.body.WSUrlBase;
  const WSLogin = req.body.WSLogin;
  const WSHeader = req.body.WSHeader;
  const StpWSUrlPath = req.body.StpWSUrlPath;
  const WSUrlAttach = req.body.WSUrlAttach;
  const DataStructure = req.body.DataStructure;
  const AuthType = req.body.AuthType;

  try {
    const WSPassword = req.body.WSPassword ? CryptoJS.AES.encrypt(req.body.WSPassword, cfg.secret).toString() : null;

    //убрали при создании интегации с 4me
    if (AuthType == 'Basic' && WSHeader && WSHeader['Authorization']) {
      return res.status(400).send({ status: 'ERROR', message: 'Запрещено указывать авторизацию в заголовке' });
    }

    let system = new SystemModel.model({
      name: name,
      type: type,
      UserId: UserId,
      ResponsibleFIO: ResponsibleFIO,
      ResponsibleEmail: ResponsibleEmail,
      ResponsiblePhone: ResponsiblePhone,
      WSUrlBase: WSUrlBase,
      WSLogin: WSLogin,
      WSPassword: WSPassword,
      WSHeader: WSHeader,
      StpWSUrlPath: StpWSUrlPath,
      WSUrlAttach: WSUrlAttach,
      DataStructure: DataStructure,
      AuthType: AuthType
    });

    await system.save();

    res.send({
      id: system._id
    });
  } catch (error) {
    logger.error(`Метод createSystem name=${name} type=${type} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Обновление системы
 * @param {Object} req
 * @param {Object} res
 */
const saveSystem = async function (req, res) {
  const id = req.params.id;

  if (!id) {
    return res.status(400).send({ status: 'ERROR', message: `Необходимо заполнить id системы` });
  }

  const name = req.body.name;
  const type = req.body.type;
  const UserId = req.body.UserId;
  const ResponsibleFIO = req.body.ResponsibleFIO;
  const ResponsibleEmail = req.body.ResponsibleEmail;
  const ResponsiblePhone = req.body.ResponsiblePhone;
  const WSUrlBase = req.body.WSUrlBase;
  const WSLogin = req.body.WSLogin;
  const WSHeader = req.body.WSHeader;
  const StpWSUrlPath = req.body.StpWSUrlPath;
  const WSUrlAttach = req.body.WSUrlAttach;
  const DataStructure = req.body.DataStructure;
  const AuthType = req.body.AuthType;

  try {
    const WSPassword = req.body.WSPassword ? CryptoJS.AES.encrypt(req.body.WSPassword, cfg.secret).toString() : null;

    //убрали при создании интегации с 4me
    if (AuthType == 'Basic' && WSHeader && WSHeader['Authorization']) {
      return res.status(400).send({ status: 'ERROR', message: 'Запрещено указывать авторизацию в заголовке' });
    }

    if (id) {
      let system = await SystemModel.model.findOne({ '_id': new ObjectId(id) });

      if (system) {
        system.name = name;
        system.type = type;
        system.UserId = UserId;
        system.ResponsibleFIO = ResponsibleFIO;
        system.ResponsibleEmail = ResponsibleEmail;
        system.ResponsiblePhone = ResponsiblePhone;
        system.WSUrlBase = WSUrlBase;
        system.WSLogin = WSLogin;
        system.WSHeader = WSHeader;
        system.StpWSUrlPath = StpWSUrlPath;
        system.WSUrlAttach = WSUrlAttach;
        system.DataStructure = DataStructure;
        system.AuthType = AuthType;

        if (req.body.WSPassword !== system.WSPassword) {
          system.WSPassword = WSPassword;
        }

        await system.save();

        res.send(system);
      } else {
        logger.info(`Метод saveSystem name=${name} id=${id} - Система с кодом ${id} не найдена`);
        return res.status(400).send({ status: 'ERROR', message: `Система с кодом ${id} не найдена` });
      }
    }

  } catch (error) {
    logger.error(`Метод saveSystem name=${name} id=${id} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Получение списка записей с пагинацией и поиском 
 * @param {Object} req
 * @param {Object} res
 */
const getSystemList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, SystemModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    SystemModel.model.paginate(searchParams, { offset, limit, populate: 'UserId', sort: { 'createdAt': -1 } })
      .then((data) => {
        const resultData = data.docs.map((item) => {
          let newItem = { ...item._doc };

          if (item.UserId) {
            newItem.UserLogin = item.UserId.login;
            newItem.UserId = item.UserId._id;
          }
          return newItem;
        })
        res.send({
          totalItems: data.totalDocs,
          data: resultData, //data.docs,
          totalPages: data.totalPages,
          currentPage: data.page - 1,
        });
      })
      .catch((error) => {
        logger.error(`Метод getSystemList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });

  } catch (error) {
    logger.error(`Метод getSystemList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createSystem,
  saveSystem,
  getSystem,
  getSystemList
}