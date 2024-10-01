const ObjectModel = require('../models/object');
const SystemModel = require('../models/system');
const STPModel = require('../models/stp');
const ObjectId = require('mongodb').ObjectId;
const agenda = require('../agenda.js');
const restController = require('../controllers/rest');
const errorHandler = require('../errorHandler.js');
const { getArrayLength, getPagination, prepareSearchParams } = require('../utils');
const logger = require('../middlewares/logger');
const { isVerifiedPath, stringify } = require('../utils');
const UserModel = require('../models/user');
const requestIp = require('request-ip');
const { services } = require('../mapping');

/**
 * Изменение параметров обьекта
 * @param {String} id - ИД обьекта
 * @param {Object} data - обьект со данными
 * @returns {Object}
 */
const changeData = async function (id, data) {
  //return await ObjectModel.model.updateOne({ '_id': id }, data);
  try {
    const updatedData = await ObjectModel.model.findOneAndUpdate({ '_id': id }, data, { returnNewDocument: true });

    if (updatedData) {
      return {
        status: 'SUCCESS',
        data: updatedData
      }
    } else {
      return {
        status: 'ERROR',
        message: `Данные по обьекту с id=${id} не найдены`
      }
    }
  } catch (error) {
    logger.error(`Метод changeData id=${id} data=${stringify(data)} - ${stringify(error)}`);
    return {
      status: 'ERROR',
      message: error.message
    }
  }
}

// верификация и смена статуса для 4me
const changeStatus4me = async function (req, res) {
  switch (req.body.event) {
    case 'webhook.verify':
      if (req.body.payload && req.body.payload.callback) {
        const user = await UserModel.model.findOne({ login: req.body.account_id });
        if (user) {
          const systemSource = await getSystemByUserId(user._id);
          if (systemSource) {
            restController.sendRestRequest('get', req.body.payload.callback, req.body.payload, null, systemSource._id, 'system', systemSource, null, 'systemVerify');
            return res.status(200).send({ status: 'SUCCESS', message: 'Верификация пройдена' });
          }
        }
      }

      return res.status(400).send({ status: 'ERROR', message: 'Верификация не пройдена' });
    case 'automation_rule':
      changeStatus(req, res);
      break;
    default:
      return res.status(400).send({ status: 'ERROR', message: 'Данное действие не поддерживается системой' });
  }
}

/**
 * Изменение статуса
 * @param {Object} req
 * @param {Object} res
 */
 const changeStatus = async function (req, res) {
  const isVerifiedSystem = !req.user && isVerifiedPath(req.url);
  const dataObject = isVerifiedSystem ? req.body.payload : req.body;
  const id = dataObject.ID;
  const systemAddresseeComment = dataObject.SystemAddresseeComment;
  const resolution = dataObject.Resolution;
  const resolutionType = dataObject.ResolutionType;
  const status = dataObject.Status;
  const availableStatuses = ['Отклонен', 'В работе', 'Выполнен', 'Закрыт'];
  let result;

  const user = isVerifiedSystem ? await UserModel.model.findOne({ login: req.body.account_id }) : req.user; 
  const systemSource = await getSystemByUserId(user._id);

  if (!systemSource) {
    result = {
      status: 'ERROR',
      message:  'Система-источник не найдена'
    }
    return res.status(400).send(result);
  }
  const ip = requestIp.getClientIp(req);
  const restObj = await restController.createRest(req.url, id, dataObject, 'Входящий', 'SUCCESS', 'object', systemSource._id, 'changeStatusObject', null, ip);

  try {
    if (!id || !status || status === 'Отклонен' && !systemAddresseeComment) {
      result = {
        status: 'ERROR',
        message:  'Отсутствуют необходимые параметры запроса'
      }
      restController.updateRest(restObj._id, { status: result.status, result: result.message, sendTriesCount: 1 });
      logger.info(`Метод changeStatus id=${id} status=${status} systemAddresseeComment=${systemAddresseeComment} - Отсутствуют необходимые параметры запроса`);
      return res.status(400).send(result);
    }

    if (availableStatuses.indexOf(status) === -1) {
      result = {
        status: 'ERROR',
        message:  `Попытка перевода обьекта в некорректный статус "${status}"`
      }
      restController.updateRest(restObj._id, { status: result.status, result: result.message, sendTriesCount: 1 });
      return res.status(400).send(result);
    }

    let newData = {
      Status: status,
      SystemAddresseeComment: systemAddresseeComment
    }

    if (status === 'Выполнен') {
      newData.Resolution = resolution;
      newData.ResolutionType = resolutionType;
    }

    const updatedObject = await changeData(id, newData);

    //if (updateObject.modifiedCount === 1) {
    if (updatedObject.status === 'SUCCESS') {
      result = {
        status: 'SUCCESS',
        ID: updatedObject.data._id,
        SystemAddresseeObjCode: updatedObject.data.SystemAddresseeObjCode,
      }
      agenda.now('changeStatus', { objectId: id });
      res.send(result);

      restController.updateRest(restObj._id, { status: 'SUCCESS', result: result, sendTriesCount: 1 });
    } else {
      const errorMessage = updatedObject.message || `Ошибка обновления записи`; // getModifiedText(updateObject)
      result = {
        status: 'ERROR',
        message: errorMessage
      }
      restController.updateRest(restObj._id, { status: result.status, result: result.message, sendTriesCount: 1 });

      logger.error(`Метод changeStatus id=${id} status=${status} systemAddresseeComment=${systemAddresseeComment} - ${stringify(errorMessage)}`);
      res.status(500).send(result);
    }
  } catch (error) {
    result = {
      status: 'ERROR',
      message: error
    }
    restController.updateRest(restObj._id, { status: result.status, result: result.message, sendTriesCount: 1 });

    logger.error(`Метод changeStatus id=${id} status=${status} systemAddresseeComment=${systemAddresseeComment} - ${stringify(error)}`);
    errorHandler(res, error)
  }
}
/**
 * Получение данных о системе-источнике по UserId пользователя
 * @param {String} UserId
 * @returns {Object}
 */
const getSystemByUserId = async function (UserId) {
  return await SystemModel.model.findOne({ 'UserId': UserId });
}

/**
 * Получение данных о системе-источнике по AccountId в whiteList
 * @param {String} UserId
 * @returns {Object}
 */
const getSystemByAccountId = async function (AccountId) {
  return await SystemModel.model.findOne({ 'UserId': AccountId });
}

/**
 * Получение данных об СТП
 * @param {String} id
 * @returns {Object}
 */
const getSTP = async function (id) {
  try {
    return await STPModel.model.findOne({ '_id': new ObjectId(id) });
  } catch (error) {
    logger.info(`Метод getSTP - СТП с кодом ${id} не найден`);
    return null
  }
}

/**
 * Cоздание обьекта
 * @param {Object} req
 * @param {Object} res
 */
 const createObject = async function (req, res) {
  const user = req.user;
  const descriptionShort = req.body.DescriptionShort;
  const contactFIO = req.body.ContactFIO;
  const contactEmail = req.body.ContactEmail;
  const contactPhone = req.body.ContactPhone;
  const systemSourceObjCode = req.body.SystemSourceObjCode;
  const systemSourceComment = req.body.SystemSourceComment;
  const systemAddresseeSTPID = req.body.SystemAddresseeSTPID;
  const service = req.body.service;
  let systemSourceAttach = req.body.SystemSourceAttach;
  let descriptionFull = req.body.DescriptionFull;
  const mainFields = ['DescriptionShort', 'ContactFIO', 'ContactEmail', 'ContactPhone', 'SystemSourceObjCode', 'SystemSourceComment',
    'SystemAddresseeSTPID', 'SystemSourceAttach', 'DescriptionFull'];
  let result;
  let customFields = {};
  let restObj;

  for (field in req.body) {
    if (mainFields.indexOf(field) == -1) {
      customFields[field] = {
        value: req.body[field]
      }
    }
  }

  if (!contactPhone && !contactEmail) {
    logger.info(`Метод createObject - любое из полей ContactPhone, ContactEmail должно быть заполнено`);
    return res.status(400).send({ status: 'ERROR', message: `Любое из полей ContactPhone, ContactEmail должно быть заполнено` });
  }

  if (service && services.indexOf(service) === -1) {
    logger.info(`Метод createObject - Поле «service» заполнено некорректно: ${service}`);
    return res.status(400).send({ status: 'ERROR', message: `Поле «service» заполнено некорректно` });
  }

  const stp = await getSTP(systemAddresseeSTPID);
  if (!stp) {
    logger.info(`Метод createObject - СТП с кодом ${systemAddresseeSTPID} не найден`);
    return res.status(400).send({ status: 'ERROR', message: `СТП с кодом ${systemAddresseeSTPID} не найден` });
  } else if (stp.blocking) {
    return res.status(400).send({ status: 'ERROR', message: `СТП с кодом ${systemAddresseeSTPID} заблокирован. Отправка в этот СТП невозможна` });
  }

  try {
    const attachLength = getArrayLength(systemSourceAttach);
    descriptionFull = descriptionFull + '\n' + '--------------------------------------------------' + '\n' + 'Количество вложений: ' + attachLength;

    const systemSource = await getSystemByUserId(user._id);
    if (!systemSource) {
      logger.info(`Метод createObject - Система-источник не найдена по учетным данным user=${user._id}`);
      return res.status(400).send({ status: 'ERROR', message: `Система-источник не найдена по учетным данным` });
    }

    /* заполнение вложений - пока только при создании. Варианты данных formdata (с вложениями), json(без вложений), binary - вложения без текстовых данных файл при создании не прикладываем */
    /*if (req.files && !SystemSourceAttach) {
      SystemSourceAttach = req.files.map(file => {
        return {
          'filename': file.filename,
          'originalname': transliteration.transliterate(file.originalname),
          'path': file.path
        }
      });
    }*/

    let object = new ObjectModel.model({
      Status: 'Новый',
      date: new Date(),
      service: service,
      DescriptionShort: descriptionShort,
      DescriptionFull: descriptionFull,
      ContactFIO: contactFIO,
      ContactEmail: contactEmail,
      ContactPhone: contactPhone,
      SystemSourceID: systemSource._id,
      SystemSourceName: systemSource.name,
      SystemSourceObjCode: systemSourceObjCode,
      SystemSourceComment: systemSourceComment,
      SystemSourceAttach: systemSourceAttach,
      SystemAddresseeID: stp.SystemID,
      SystemAddresseeName: stp.name,
      SystemAddresseeSTPID: systemAddresseeSTPID,
      CustomFields: customFields,
      //Resolution: resolution,
      //ResolutionType: resolutionType
    });

    await object.save();
    const ip = requestIp.getClientIp(req);
    restObj = await restController.createRest(req.url, object._id, req.body, 'Входящий', 'SUCCESS', 'object', systemSource._id, 'createObject', null, ip);
    agenda.now('createObject', { objectId: object._id }); //, jobNumber: 0

    result = {
      status: 'SUCCESS',
      ID: object._id,
      DescriptionShort: object.DescriptionShort,
      DescriptionFull: object.DescriptionFull,
      ContactFIO: object.ContactFIO,
      ContactEmail: object.ContactEmail,
      ContactPhone: object.ContactPhone,
      SystemSourceID: object.SystemSourceID,
      SystemSourceName: object.SystemSourceName,
      SystemSourceObjCode: object.SystemSourceObjCode,
      SystemSourceComment: object.SystemSourceComment,
      SystemSourceAttach: object.SystemSourceAttach,
      SystemAddresseeSTPID: object.SystemAddresseeSTPID,
      service: object.service
    }
    restController.updateRest(restObj._id, { status: 'SUCCESS', result: result, sendTriesCount: 1 });

    res.send(result);

  } catch (error) {
    result = {
      status: 'ERROR',
      message: error.message
    }

    if (restObj) {
      restController.updateRest(restObj._id, { status: result.status, result: result.message, sendTriesCount: 1 });
    }

    logger.error(`Метод createObject user=${user} - ${stringify(error)}`);
    res.status(500).send(result);
  }
};

/**
 * Cохранение обьекта
 * @param {Object} req
 * @param {Object} res
 */
const saveObject = async function (req, res) {
  const id = req.body.id;

  if (!id) {
    return res.status(400).send({ status: 'ERROR', message: `Необходимо заполнить id объекта` });
  }

  const descriptionShort = req.body.DescriptionShort;
  const descriptionFull = req.body.DescriptionFull;
  const contactFIO = req.body.ContactFIO;
  const contactEmail = req.body.ContactEmail;
  const contactPhone = req.body.ContactPhone;
  const systemSourceObjCode = req.body.SystemSourceObjCode;
  const systemSourceComment = req.body.SystemSourceComment;
  const status = req.body.Status;
  const systemAddresseeSTPID = req.body.SystemAddresseeSTPID;
  const systemSourceID = req.body.SystemSourceID;
  const systemSourceAttach = req.body.SystemSourceAttach;
  const systemAddresseeName = req.body.SystemAddresseeName;
  const systemAddresseeObjCode = req.body.SystemAddresseeObjCode;
  const systemAddresseeComment = req.body.SystemAddresseeComment;
  const systemAddresseeAttach = req.body.SystemAddresseeAttach;
  const resolution = req.body.Resolution;
  const resolutionType = req.body.ResolutionType;
  const service = req.body.service;

  const stp = await getSTP(systemAddresseeSTPID);
  if (!stp) {
    logger.info(`Метод saveObject - СТП с кодом ${systemAddresseeSTPID} не найден`);
    return res.status(400).send({ status: 'ERROR', message: `СТП с кодом ${systemAddresseeSTPID} не найден` });
  }

  try {
    const systemSource = await SystemModel.model.findOne({ '_id': new ObjectId(systemSourceID) });
    if (!systemSource) {
      logger.info(`Метод saveObject - Система-источник не найдена`);
      return res.status(400).send({ status: 'ERROR', message: `Система-источник не найдена` });
    }

    let object = await ObjectModel.model.findOne({ '_id': new ObjectId(id) });

    if (object) {
      object.Status = status;
      object.DescriptionShort = descriptionShort;
      object.DescriptionFull = descriptionFull;
      object.ContactFIO = contactFIO;
      object.ContactEmail = contactEmail;
      object.ContactPhone = contactPhone;
      object.SystemSourceID = systemSource._id;
      object.SystemSourceName = systemSource.name;
      object.SystemSourceObjCode = systemSourceObjCode;
      object.SystemSourceComment = systemSourceComment;
      object.SystemSourceAttach = systemSourceAttach;
      object.SystemAddresseeID = stp.SystemID;
      object.SystemAddresseeSTPID = systemAddresseeSTPID;
      object.SystemAddresseeName = systemAddresseeName;
      object.SystemAddresseeObjCode = systemAddresseeObjCode;
      object.SystemAddresseeComment = systemAddresseeComment;
      object.SystemAddresseeAttach = systemAddresseeAttach;
      object.Resolution = resolution;
      object.ResolutionType = resolutionType;
      object.service = service;

      await object.save();

      res.send(object);
    } else {
      logger.info(`Метод saveObject - Обьект с кодом ${id} не найден`);
      res.status(400).send({ status: 'ERROR', message: `Обьект с кодом ${id} не найден` });
    }
  } catch (error) {
    logger.error(`Метод saveObject id=${id} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

/**
 * Чтение обьекта
 * @param {Object} req
 * @param {Object} res
 */
const getObject = async function (req, res) {
  const id = req.params.id;

  try {
    const object = await ObjectModel.model.findOne({ '_id': new ObjectId(id) });

    if (object) {
      const systemAddressee = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemAddresseeID) });

      if (systemAddressee) {
        res.send({
          _id: object._id,
          date: object.date,
          Status: object.Status,
          DescriptionShort: object.DescriptionShort,
          DescriptionFull: object.DescriptionFull,
          ContactFIO: object.ContactFIO,
          ContactEmail: object.ContactEmail,
          ContactPhone: object.ContactPhone,
          SystemSourceID: object.SystemSourceID,
          SystemSourceName: object.SystemSourceName,
          SystemSourceObjCode: object.SystemSourceObjCode,
          SystemSourceComment: object.SystemSourceComment,
          SystemSourceAttach: object.SystemSourceAttach,
          SystemAddresseeSTPID: object.SystemAddresseeSTPID,
          SystemAddresseeID: object.SystemAddresseeID,
          SystemAddresseeName: systemAddressee.name,
          SystemAddresseeObjCode: object.SystemAddresseeObjCode,
          SystemAddresseeComment: object.SystemAddresseeComment,
          SystemAddresseeAttach: object.SystemAddresseeAttach,
          CustomFields: object.CustomFields,
          Resolution: object.Resolution,
          ResolutionType: object.ResolutionType,
          service: object.service
        });
      } else {
        logger.info(`Метод getObject - Система с кодом ${object.SystemAddresseeID} не найдена`);
        res.status(400).send({ status: 'ERROR', message: `Система с кодом ${object.SystemAddresseeID} не найдена` });
      }
    } else {
      logger.info(`Метод getObject - Обьект с кодом ${id} не найден`);
      res.status(400).send({ status: 'ERROR', message: `Обьект с кодом ${id} не найден` });
    }

  } catch (error) {
    logger.error(`Метод getObject id=${id} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};


/**
 * Список обьектов с пагинацией
 * @param {Object} req
 * @param {Object} res
 */
const getObjectList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, ObjectModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    ObjectModel.model.paginate(searchParams, { offset, limit, populate: ['SystemSourceID', 'SystemAddresseeID', 'SystemAddresseeSTPID'], sort: { 'createdAt': -1 } })
      .then((data) => {
        const resultData = data.docs.map((item) => {
          let newItem = { ...item._doc };

          if (item.SystemSourceID) {
            newItem.SystemSourceID = item.SystemSourceID._id;
          }

          if (item.SystemAddresseeID) {
            newItem.SystemAddresseeName = item.SystemAddresseeID.name;
            newItem.SystemAddresseeID = item.SystemAddresseeID._id;
          }

          if (item.SystemAddresseeSTPID) {
            newItem.SystemAddresseeSTPName = item.SystemAddresseeSTPID.name;
            newItem.SystemAddresseeSTPID = item.SystemAddresseeSTPID._id;
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
        logger.error(`Метод getObjectList page=${page} size=${size} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });

  } catch (error) {
    logger.error(`Метод getObjectList page=${page} size=${size} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createObject,
  saveObject,
  getObject,
  changeData,
  changeStatus,
  changeStatus4me,
  getObjectList
}