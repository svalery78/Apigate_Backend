const ObjectId = require('mongodb').ObjectId;
const { getPagination, prepareSearchParams, stringify } = require('../utils');
const SettingModel = require('../models/setting');
const logger = require('../middlewares/logger');

/**
 * Добавление записи настроек
 * @param {Object} req
 * @param {Object} res
 */
const createSetting = async function (req, res) {
  try {
    const name = req.body.name;
    const value = req.body.value;

    let setting = new SettingModel.model({
      name: name,
      value: value
    });

    setting = await setting.save();

    if (setting._id) {
      res.send({
        status: 'SUCCESS',
        id: setting._id
      });
    } else {
      res.status(500).send({
        status: 'ERROR',
        message: 'Ошибка сохранения записи настроек'
      });
    }
  } catch (error) {
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Сохранение данных о записи настроек
 * @param {Object} req
 * @param {Object} res
 */
const saveSetting = async function (req, res) {
  try {
    const id = req.params.id;
    const name = req.body.name;
    const value = req.body.value;

    if (id) {
      let setting = await SettingModel.model.findOne({ '_id': new ObjectId(id) });

      if (setting) {
        setting.name = name;
        setting.value = value;
        await setting.save();

        res.send({
          id: id
        });
      } else {
        return res.status(400).send({ status: 'ERROR', message: 'Настройка с кодом ' + id + ' не найдена' });
      }
    } else {
      return res.status(400).send({ status: 'ERROR', message: 'Не передан код настройки' });
    }
  } catch (error) {
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Получение записи настройки
 * @param {Object} req
 * @param {Object} res
 */
const getSetting = async function (req, res) {
  try {
    const id = req.params.id;
    const setting = await SettingModel.model.findOne({ '_id': new ObjectId(id) });

    if (setting) {
        res.send({
          id: setting._id,
          value: setting.value,
          name: setting.name,
        });
    } else {
      res.status(400).send({ status: 'ERROR', message: 'Настройка с кодом ' + id + ' не найдена' });
    }

  } catch (error) {
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
const getSettingList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, SettingModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    SettingModel.model.paginate(searchParams, { offset, limit, sort: { 'createdAt': -1 } })
      .then((data) => {
        res.send({
          totalItems: data.totalDocs,
          data: data.docs,
          totalPages: data.totalPages,
          currentPage: data.page
        });
      })
      .catch((error) => {
        logger.error(`Метод getSettingList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });
  } catch (error) {
    logger.error(`Метод getSettingList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createSetting,
  saveSetting,
  getSetting,
  getSettingList
}