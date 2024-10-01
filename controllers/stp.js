const StpModel = require('../models/stp');
const ObjectId = require('mongodb').ObjectId;
const agenda = require('../agenda.js');
const { getPagination, prepareSearchParams, stringify } = require('../utils');
const SystemModel = require('../models/system');
const logger = require('../middlewares/logger');

/**
 * Добавление записи СТП
 * @param {Object} req
 * @param {Object} res
 */
const createSTP = async function (req, res) {
  try {
    const name = req.body.name;
    const SystemID = req.body.SystemID;
    const WSUrlPath = req.body.WSUrlPath;
    const blocking = req.body.blocking;

    // создаем
    let stp = new StpModel.model({
      name: name,
      SystemID: SystemID,
      WSUrlPath: WSUrlPath,
      blocking: blocking
    });

    stp = await stp.save();

    if (stp._id) {
      agenda.now('createSTP', { stpId: stp._id });

      res.send({
        status: 'SUCCESS',
        id: stp._id
      });
    } else {
      res.status(500).send({
        status: 'ERROR',
        message: 'Ошибка сохранения записи СТП'
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
 * Сохранение данных о записи СТП
 * @param {Object} req
 * @param {Object} res
 */
const saveSTP = async function (req, res) {
  try {
    const id = req.params.id;
    const name = req.body.name;
    const SystemID = req.body.SystemID;
    const WSUrlPath = req.body.WSUrlPath;
    const blocking = req.body.blocking;

    if (id) {
      // ищем систему по id, если найдено - обновляем
      let stp = await StpModel.model.findOne({ '_id': new ObjectId(id) });

      if (stp) {
        // обновляем
        stp.name = name;
        stp.SystemID = SystemID;
        stp.WSUrlPath = WSUrlPath;
        stp.blocking = blocking;

        const updateResult = await stp.save();
        agenda.now('updateSTP', { stpId: stp._id });

        res.send({
          id: id
        });
      } else {
        return res.status(400).send({ status: 'ERROR', message: 'СТП с кодом ' + id + ' не найден' });
      }
    } else {
      return res.status(400).send({ status: 'ERROR', message: 'Не передан код СТП' });
    }
  } catch (error) {
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Получение записи СТП
 * @param {Object} req
 * @param {Object} res
 */
const getSTP = async function (req, res) {
  try {
    const id = req.params.id;
    const stp = await StpModel.model.findOne({ '_id': new ObjectId(id) });

    if (stp) {
      const system = await SystemModel.model.findOne({ '_id': new ObjectId(stp.SystemID) });

      if (system) {
        stp.SystemName = system.name;

        res.send({
          ID: stp._id,
          Name: stp.name,
          SystemID: stp.SystemID,
          SystemName: stp.SystemName,
          WSUrlPath: stp.WSUrlPath,
          blocking: stp.blocking
        });
      } else {
        res.status(400).send({ status: 'ERROR', message: 'Система с кодом ' + stp.SystemID + ' не найдена' });
      }
    } else {
      res.status(400).send({ status: 'ERROR', message: 'СТП с кодом ' + id + ' не найдена' });
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
const getStpList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, StpModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    StpModel.model.paginate(searchParams, { offset, limit, populate: 'SystemID', sort: { 'createdAt': -1 } })
      .then((data) => {
        const resultData = data.docs.map((item) => {
          let newItem = {...item._doc};

          if (item.SystemID) {
            newItem.SystemName = item.SystemID.name;
            newItem.SystemID = item.SystemID._id;
          }
          return newItem;
        })

        res.send({
          totalItems: data.totalDocs,
          data: resultData, //data.docs,
          totalPages: data.totalPages,
          currentPage: data.page,
        });
      })
      .catch((error) => {
        logger.error(`Метод getStpList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });
  } catch (error) {
    logger.error(`Метод getStpList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createSTP,
  saveSTP,
  getSTP,
  getStpList
}