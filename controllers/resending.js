const ResendingModel = require('../models/resending');
const ObjectId = require('mongodb').ObjectId;
const { getPagination, prepareSearchParams } = require('../utils');
const SystemModel = require('../models/system');
const logger = require('../middlewares/logger');

// Алгоритм определения интервала времени для повторной отправки Запроса:
const getRepeatIntervalAndTotal = async (sendTriesCount) => {
  let resending = await ResendingModel.model.findOne({ 'systemId': { $exists: false } });
  let interval;
  let i = 0; //порядковый номер значения массива из поля «settings»
  let sum = 0; //сумма значений полей «count» текущего и предыдущих значений массива из поля «settings»

  if (resending && resending['countTotal'] >= sendTriesCount) {
    const settings = resending['settings'];
    const max = settings.length;

    while (i < max && sum <= sendTriesCount) {
      sum = sum + settings[i]['count'];
      if (sum >= sendTriesCount) {
        interval = settings[i]['interval']
      }

      i++;
    }
  }

  return {
    interval: interval*60,
    countTotal: resending['countTotal']
  }
}

/**
 * Добавление записи
 * @param {Object} req
 * @param {Object} res
 */
const createResending = async function (req, res) {
  try {
    const systemID = req.body.systemID;
    const countTotal = req.body.countTotal;
    const settings = req.body.settings;

    // создаем
    let resending = new ResendingModel.model({
      systemID: systemID,
      countTotal: countTotal,
      settings: settings
    });

    resending = await resending.save();

    if (resending._id) {
      res.send({
        status: 'SUCCESS',
        id: resending._id
      });
    } else {
      res.status(500).send({
        status: 'ERROR',
        message: 'Ошибка сохранения записи повторной отправки'
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
 * Сохранение данных о записи повторной отправки
 * @param {Object} req
 * @param {Object} res
 */
const saveResending = async function (req, res) {
  try {
    const id = req.params.id;
    const systemId = req.body.systemId;
    const systemName = req.body.systemName;
    const countTotal = req.body.countTotal;
    const settings = req.body.settings;

    if (id) {
      // ищем систему по id, если найдено - обновляем
      let resending = await ResendingModel.model.findOne({ '_id': new ObjectId(id) });

      if (resending) {
        // обновляем
        if (systemId) { 
          //Есть связь с системой - обновляем эти поля
          resending.systemId = systemId; 
          resending.systemName = systemName;
        } 
        resending.countTotal = countTotal;
        resending.settings = settings;

        //const updateResult = await resending.save();
        await resending.save();

        res.send({
          id: id
        });
      } else {
        return res.status(400).send({ status: 'ERROR', message: 'Повторная отправка с кодом ' + id + ' не найдена' });
      }
    } else {
      return res.status(400).send({ status: 'ERROR', message: 'Не передан код повторной отправки' });
    }
  } catch (error) {
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Получение записи повторной отправки
 * @param {Object} req
 * @param {Object} res
 */
const getResending = async function (req, res) {
  try {
    const id = req.params.id;
    const resending = await ResendingModel.model.findOne({ '_id': new ObjectId(id) });

    if (resending) {
      const system = await SystemModel.model.findOne({ '_id': new ObjectId(resending.systemId) });

      if (system) {
        resending.systemName = system.name;
      }

      res.send({
        id: resending._id,
        systemId: resending.systemId,
        systemName: resending.systemName || 'по умолчанию',
        countTotal: resending.countTotal,
        settings: resending.settings
      });
      // } else {
      //   res.status(400).send({ status: 'ERROR', message: 'Система с кодом ' + resending.systemId + ' не найдена' });
      // }
    } else {
      res.status(400).send({ status: 'ERROR', message: 'Повторная отправка с кодом ' + id + ' не найдена' });
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
const getResendingList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, ResendingModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    ResendingModel.model.paginate(searchParams, { offset, limit, populate: 'systemId', sort: { 'createdAt': -1 } })
      .then((data) => {
        const resultData = data.docs.map((item) => {
          let newItem = { ...item._doc };

          if (item.systemId) {
            newItem.systemName = item.systemId.name;
            newItem.systemId = item.systemId._id;
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
        logger.error(`Метод getResendingList page=${page} size=${size} searchParams=${searchParams} - ${error}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });
  } catch (error) {
    logger.error(`Метод getResendingList page=${page} size=${size} searchParams=${searchParams} - ${error}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createResending,
  saveResending,
  getResending,
  getResendingList,
  getRepeatIntervalAndTotal
}