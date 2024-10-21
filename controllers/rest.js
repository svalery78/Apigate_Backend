const axios = require('axios');
const RestModel = require('../models/rest');
const ObjectId = require('mongodb').ObjectId;
const { parseJsonString, getErrorText, getResponseData, getResponseStatus, getPagination, getParams, getServiceName, getAttachURL, needSlash, formatData, getRestInfo, prepareSearchParams } = require('../utils');
const { sendWithQueue } = require('../middlewares/queue');
const SystemModel = require('../models/system');
const ObjectModel = require('../models/object');
const StpModel = require('../models/stp');
//const SettingModel = require('../models/setting');
const transliteration = require('transliteration.cyr');
const agenda = require('../agenda.js');
const logger = require('../middlewares/logger');
const { getObjCode, stringify } = require('../utils');
const FormData = require('form-data');
const https = require('https');
const resendingController = require('../controllers/resending');
const cfg = require('../config');
const httpsAgent = new https.Agent({ rejectUnauthorized: cfg.rejectUnauthorized })
const instance = axios.create({
  httpsAgent: httpsAgent
});
axios.defaults.httpsAgent = httpsAgent

/**
 * отправка вложения в систему см\не типа см - сейчас сделали все на ссылках
 * @param {string} systemAddressee - система-получатель
 * @param {string} filepath - ссылка на файл
 * @param {string} addresseeObjectCode - код обьекта из системы-источника
 * @param {string} objectId - ИД обьекта
 * @param {string} systemSource - Система-получатель
 * @param {string} restId - ИД конфигурации отправки запроса (для повторной отправки)
 * @returns {Object} {status: , error: }
 */
const sendAttach = async (systemAddressee, filepath, addresseeObjectCode, objectId, systemSource, restId) => {
  try {
    const attachAddresseeUrl = getAttachURL(systemAddressee);
    let attachAddresseeFullUrl = attachAddresseeUrl;
    let params = getParams(systemSource);
    let attachGetResponse;

    // получение параметров, с которыми забираем вложение из источника
    switch (systemSource.type) {
      case 'sm':
        params = {
          responseType: 'arraybuffer', //responseType: 'blob',
          ...params
        }
        break;
      default:
        // используем по умолчанию
        break;
    }

    // получение URL, куда отправлять вложение
    switch (systemAddressee.type) {
      case 'sm':
        attachAddresseeFullUrl = `${attachAddresseeUrl}${needSlash(attachAddresseeUrl) ? '/' : ''}${addresseeObjectCode}/attachments`;
        break;
      case 'json':
        switch (systemAddressee.DataStructure) {
          case '4me (json)':
            attachAddresseeFullUrl = `${systemAddressee.WSUrlBase}${needSlash(systemAddressee.WSUrlBase) ? '/' : ''}attachments/storage`; // первый урл
            break;
        }
        break;
      default:
        // получение просто по URL
        break;
    }

    if (!restId) { // если не повторный запрос, то создаем новую запись в таблице rest
      const rest = await createRest(attachAddresseeFullUrl, objectId, filepath, 'Исходящий', 'SENDING', 'attachment', systemAddressee._id, 'sendAttach');
      restId = rest._id;
    }

    try {
      // Получение вложения для отправки
      attachGetResponse = await callAxios('get', filepath, systemSource._id, {}, params);
      //await sendWithQueue(() => axios.get(filepath, params), systemSource._id);
    } catch (getAttachError) {
      logger.error(`Метод sendAttach ошибка получения вложения из системы-источника systemAddressee=${systemAddressee._id} filepath=${filepath} addresseeObjectCode=${addresseeObjectCode} objectId=${objectId} systemSource=${systemSource._id} restId=${restId} - ${stringify(getAttachError)}`);
      updateRest(restId, { status: 'ERROR', result: getErrorText(getAttachError) });
      return;
    }

    // Если удалось получить вложение
    if (attachGetResponse) {
      let filename;

      // тут пока не совсем понятно, откуда брать filename  в системах не типа sm
      // в 4me тоже inline; filename="file.jpeg"; filename*=UTF-8''file.jpeg, так что тоже должно работать
      // в jira, например, по-другому
      if (attachGetResponse.headers['content-disposition']) {
        const contentDispositionHeaders = attachGetResponse.headers['content-disposition'].split(';');
        const filenameHeader = contentDispositionHeaders.find((header) => {
          return header.indexOf('filename*=UTF-8\'\'') !== -1;
        })

        if (filenameHeader) {
          filename = filenameHeader.substring(17);
          filename = transliteration.transliterate(decodeURI(filename));
          filename = filename.replace(/\+/gi, ' ');
          filename = filename.replace(/[*#:@%='?\\"+\<>\/\]\[\{\}\|,̆]/gi, '_');
          filename = encodeURI(filename);
        } else {
          updateRest(restId, { status: 'ERROR', result: { error: 'Не найден filename*=UTF-8 в content-disposition', errorData: contentDispositionHeaders } });
          return;
        }
      } else {
        updateRest(restId, { status: 'ERROR', result: 'Не найден content-disposition в заголовках' });
        return;
      }

      const filesize = Buffer.byteLength(attachGetResponse.data);
      const addresseeParams = getParams(systemAddressee);

      // отправка вложения
      switch (systemAddressee.type) {
        case 'sm':
          addresseeParams.headers['Content-Type'] = 'application/octet-stream';
          addresseeParams.headers['Content-Disposition'] = `attachment; filename=${filename}`;

          return await sendRestRequest('post', attachAddresseeFullUrl, { data: attachGetResponse.data, url: filepath, filename: filename, filesize: filesize },
            addresseeParams, objectId, 'attachment', systemAddressee, null, 'sendAttach', restId);
        case 'json':
        default:
          switch (systemAddressee.DataStructure) {
            case '4me (json)':
              // 1. Резервирование места
              const reserveSpaceResult = await sendRestRequest('get', attachAddresseeFullUrl, {}, addresseeParams, objectId, 'attachment', systemAddressee, null, 'sendAttach', restId, true);
              if (reserveSpaceResult.status === 'ERROR') { return; };

              const expiration = reserveSpaceResult.local['x-4me-expiration'];
              const signature = reserveSpaceResult.local['x-4me-signature'];
              const key = reserveSpaceResult.local.key;

              // 2. получить URL
              var formData = new FormData()
              formData.append('key', key);
              formData.append('x-4me-expiration', expiration);
              formData.append('x-4me-signature', signature);
              formData.append('file', attachGetResponse.data, transliteration.transliterate(decodeURI(filename)));

              const addresseeParamsGetURL = {
                ...addresseeParams,
                headers: {
                  ...addresseeParams.headers,
                  ...formData.getHeaders()
                }
              }

              const receiveURLResult = await sendRestRequest('post',
                systemAddressee.WSUrlBase + (needSlash(systemAddressee.WSUrlBase) ? '/' : '') + 'attachments',
                { data: formData, url: filepath, filename: filename, filesize: filesize }, addresseeParamsGetURL, objectId, 'attachment',
                systemAddressee, null, 'sendAttach', restId, true);

              if (receiveURLResult.status === 'ERROR') { return; };

              // 3. Прикрепить вложение к записи
              const object = await ObjectModel.model.findOne({ '_id': new ObjectId(objectId) });
              return await sendRestRequest('patch', systemAddressee.WSUrlBase + (needSlash(systemAddressee.WSUrlBase) ? '/' : '') + 'requests/' + object.SystemAddresseeObjCode,
                {
                  data: {
                    'note_attachments': [
                      { 'key': receiveURLResult.key }
                    ]
                  }
                }, addresseeParams, objectId, 'attachment', systemAddressee, null, 'sendAttach', restId, true);
            default:
              return await sendRestRequest('post', attachAddresseeFullUrl, { data: attachGetResponse.data, url: filepath, filename: filename, filesize: filesize },
                addresseeParams, objectId, 'attachment', systemAddressee, null, 'sendAttach', restId);
          }
      }
    } else {
      updateRest(restId, { status: 'ERROR', result: 'Пустой ответ, вложение не получено' });
    }
  } catch (error) {
    logger.error(`Метод sendAttach systemAddressee=${systemAddressee._id} filepath=${filepath} addresseeObjectCode=${addresseeObjectCode} 
      objectId=${objectId} systemSource=${systemSource._id} restId=${restId} - ${stringify(error)}`);
  }
}

/**
 * Отправка вложений
 * @param {Object} systemAddressee - Система-получатель
 * @param {Array} files - список файлов (пути)
 * @param {String} addresseeObjectCode - Код обьекта из системы-источника
 * @param {String} objectId - ИД обьекта в ApiGate
 * @param {String} systemSourceID - ИД системы-источника
 */
const sendAttachments = async function (systemAddressee, files, addresseeObjectCode, objectId, systemSourceID) {
  const systemSource = await SystemModel.model.findOne({ '_id': new ObjectId(systemSourceID) });
  const attachGetUrl = getAttachURL(systemSource);

  files.forEach(file => {
    let filepath = `${attachGetUrl}${needSlash(attachGetUrl) ? '/' : ''}${file}`;
    sendAttach(systemAddressee, filepath, addresseeObjectCode, objectId, systemSource);
  });
};

/**
 * Получение URL для отправки запроса
 * @param {String} WSUrlBase
 * @param {String} SystemID
 */
const getWSURL = async (WSUrlBase, SystemID) => {
  const stp = await StpModel.model.findOne({ 'SystemID': SystemID, blocking: false });

  if (stp && stp.WSUrlPath) {
    return WSUrlBase + stp.WSUrlPath;
  }

  return WSUrlBase;
}

/**
 * Отправка запроса по обьекту
 * @param {String} objectId
 * @param {String} tableName
 * @param {Object} SystemAddressee
 * @param {Object} data
 * @param {String} AttachSystemSourceID
 * @param {String} action
 * @param {String} restId
 */
const sendObjectRequest = async (objectId, tableName, SystemAddressee, data, AttachSystemSourceID, action, restId) => {
  try {
    const object = await ObjectModel.model.findOne({ '_id': objectId });
    if (object) {
      const url = await getWSURL(SystemAddressee.WSUrlBase, SystemAddressee._id);
      const serviceName = getServiceName(SystemAddressee.type, url);
      const sendedData = formatData(data, SystemAddressee.type, serviceName, 'string', restId);
      const params = getParams(SystemAddressee);
      const response = await sendRestRequest('post', url, sendedData, params, object._id, tableName, SystemAddressee, serviceName, action, restId);
      response.systemObjectCode = getObjCode(response, SystemAddressee.type, SystemAddressee.DataStructure);

      if (AttachSystemSourceID && response.operationStatus === 'SUCCESS' && response.systemObjectCode && object.SystemSourceAttach && object.SystemSourceAttach.length > 0) {
        await sendAttachments(SystemAddressee, object.SystemSourceAttach, response.systemObjectCode, objectId, AttachSystemSourceID, restId);
      }
      return response;
    } else {
      logger.error(`Метод sendObjectRequest objectId=${objectId} не найден`);
      return {
        status: 'ERROR',
        error: 'Объект ' + objectId + ' не найден',
      }
    }
  } catch (error) {
    logger.error(`Метод sendObjectRequest objectId=${objectId} tableName=${tableName} - ${stringify(error)}`);
    return {
      status: 'ERROR',
      error: getErrorText(error)
    }
  }
}

const callAxios = async function (method, url, systemId, requestData, params) {
  switch (method) {
    case 'get':
      return await sendWithQueue(() => instance[method](url, params), systemId);
    //axios[method](url, params), systemId);
    case 'put':
    case 'post':
    case 'patch':
      return await sendWithQueue(() => instance[method](url, requestData, { ...params, maxContentLength: Infinity, maxBodyLength: Infinity }), systemId); //1000000000
    //axios[method]
    default:
      return {
        status: 'ERROR',
        error: `Метод ${method} не поддерживается`
      }
  }
}

/* функция очистки инфо из ошибки, по вложениям само вложение удаляется
*/
const clearErrorData = function (errorData, tableName) {
  result = errorData;

  if (typeof errorData === 'object') {
    if (tableName === 'attachment') {
      if (result && result.config && result.config.data) {
        result.config.data = null;
      }
    }
  }

  return result;
}

/**
 * обертка над axios для сохранения записи в таблицу Rest
 * @param {string} url - url адрес отправки
 * @param {string} data - данные для отправки
 * @param {string} params - заголовки
 * @param {string} id - id обьекта (стп, обьект)
 * @param {string} tableName - имя таблицы
 * @param {string} systemType - тип системы (sm, json)
 * @param {string} serviceName - имя сервиса (для систем типа см)
 * @param {string} restId - ид записи отправки запроса (для повтора)
 * @returns {Object} {status: , error: }
 */
const sendRestRequest = async function (method, url, data, params, id, tableName, system, serviceName, action, restId, needReplaceUrl) {
  try {
    let loggingData;
    const requestSaved = data && tableName === 'attachment' ? data.url : data;
    const requestData = data && tableName === 'attachment' ? data.data : data;
    loggingData = tableName === 'attachment' ? null : requestData;
    const info = getRestInfo(tableName, data);
    const restObj = restId ? await RestModel.model.findOne({ '_id': new ObjectId(restId) }) : await createRest(url, id, requestSaved, 'Исходящий', 'SENDING', tableName, system._id, action, info);
    let restData;

    if (restObj && restObj._id) {
      try {
        const responseObj = await callAxios(method, url, system._id, requestData, params)
        const responseData = getResponseData(responseObj, system.type, serviceName);
        const response = responseData ? parseJsonString(responseData) : responseData;
        const responseStatus = getResponseStatus(response.status, responseObj.status, url);
        restData = { status: responseStatus, result: response, info: info };
        if (needReplaceUrl) { restData.url = url };
        updateRest(restObj._id, restData);

        if (responseStatus === 'ERROR' && response && response.error) {
          logger.error(`Метод sendRestRequest url=${url} data=${stringify(loggingData)} params=${stringify(params)} id=${id} - ${stringify(clearErrorData(response.error, tableName))}`);
        }
        return { ...response, operationStatus: responseStatus };
      } catch (error) {
        logger.error(`Метод sendRestRequest url=${url} data=${stringify(loggingData)} params=${stringify(params)} id=${id} - ${stringify(clearErrorData(error, tableName))}`);
        restData = { status: 'ERROR', result: getErrorText(error), info: info };
        if (needReplaceUrl) { restData.url = url };
        updateRest(restObj._id, restData);
        return {
          status: 'ERROR',
          error: getErrorText(error)
        }
      }
    } else {
      return restObj || {
        status: 'ERROR',
        error: 'Запись конфигурации Rest не найдена'
      }
    }
  } catch (error) {
    logger.error(`Метод sendRestRequest url=${url} data=${stringify(loggingData)} params=${stringify(params)} id=${id} - ${stringify(clearErrorData(error, tableName))}`);
    return {
      status: 'ERROR',
      message: error.message
    }
  }
}

/**
 * обертка над axios для сохранения записи в таблицу Rest
 * @param {string} object - url адрес отправки
 * @param {string} system - данные для отправки
 * @param {string} restId - ИД 
 * @returns {Object} {status: , error: }
 */
const sendObjectChangeStatus = async (object, system, restId) => { //, requestData
  // 1.	В WS Системы-Источника отправить запрос по событию «Статус изменен».
  let data;

  // if (requestData) {
  //   data = requestData;
  // } else {
  data = {
    'service': object.service,
    'action': 'objUpdate',
    'ID': object._id.toString(),
    'Status': object.Status,
    SystemAddresseeObjCode: object.SystemAddresseeObjCode //10043
    //'SystemSourceObjCode': object.SystemSourceObjCode, // def 8915
    //'SystemAddresseeName': system.name, // def 8915
    //'SystemAddresseeSTPID': object.SystemAddresseeSTPID //  def 8915
  }

  //if (object.Status !== 'Новый' && object.Status !== 'Передан') {
  /*if (object.Status === 'Зарегистрирован') {
    data.SystemAddresseeObjCode = object.SystemAddresseeObjCode;
  }*/

  if (object.Status === 'Отклонен') {
    data.SystemAddresseeСomment = object.SystemAddresseeСomment;
  }

  if (object.Status === 'Выполнен') {
    data.Resolution = object.Resolution;
    data.ResolutionType = object.ResolutionType;
  }
  //}

  return await sendObjectRequest(object._id, 'object', system, data, null, 'changeStatusObject', restId);
}

/**
 * вызов метода повторения отправки c фронта
 * @param {Object} req
 * @param {Object} res
 */
const repeatRequest = async function (req, res) {
  const restId = req.body.restId;
  const result = await repeatRestRequest(restId, 'front');

  res.send(result);
}

/**
 * повторение запроса через интерфейс и при неудачной отправке автоматически
 * @param {string} restId - id обьекта rest
 * @returns {Object} {status: , error: }
 */
const repeatRestRequest = async function (restId, type) {
  const rest = await RestModel.model.findOne({ '_id': new ObjectId(restId) });
  let object;

  if (rest && rest.status !== 'SUCCESS') {
    const system = await SystemModel.model.findOne({ '_id': new ObjectId(rest.systemId) });

    if (system) {
      switch (rest.tableName) {
        case 'stp':
          // проставляем статус SENDING для отображения желтого кружочка
          await updateRest(restId, { status: 'SENDING' });
          const params = getParams(system);
          const serviceName = getServiceName(system.type, rest.url);
          return await sendRestRequest('post', rest.url, rest.request, params, rest.objectID, rest.tableName, system, serviceName, null, restId);
        case 'attachment':
          object = await ObjectModel.model.findOne({ '_id': new ObjectId(rest.objectID) });

          if (object) {
            // проставляем статус SENDING для отображения желтого кружочка
            await updateRest(restId, { status: 'SENDING' });
            const systemSource = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemSourceID) });
            return await sendAttach(system, rest.request, object.SystemAddresseeObjCode, object._id, systemSource, restId);
          } else {
            return {
              status: 'ERROR',
              message: `Обьект с id=${rest.objectID} не найден`
            }
          }
        case 'object':
          //обьект - создание
          // 1.	В WS Системы-Получателя отправить запрос по событию «Объект создан». 
          object = await ObjectModel.model.findOne({ '_id': new ObjectId(rest.objectID) });

          if (object) {
            switch (rest.action) {
              case 'createObject':
                //вся отправка
                agenda.now('createObject', { objectId: object._id, jobNumber: 0 });
                break;
              case 'changeStatusObject':
                if (type !== 'front') {
                  //const newRest = await RestModel.model.findOne({ '_id': new ObjectId(restId) });
                  const newRest = await RestModel.model.findOne({ objectID: new ObjectId(object._id), action: 'changeStatusObject', data: { $gt: rest.data } });

                  if (newRest) {
                    // проставляем статус IRRELEVANT для отображения серого кружочка
                    await updateRest(restId, { status: 'IRRELEVANT' });
                    return {
                      status: 'ERROR',
                      message: `Запрос неактуален`
                    }
                  }
                }
                // проставляем статус SENDING для отображения желтого кружочка
                await updateRest(restId, { status: 'SENDING' });
                // отправить запрос на смену статуса
                return await sendObjectChangeStatus(object, system, restId); //, rest.request
              default:
                return {
                  status: 'ERROR',
                  message: `Повторная отправка действия ${rest.action} не предусмотрена`
                }
            }
            /*switch (object.Status) {
              case 'Новый':
                //вся отправка
                agenda.now('createObject', { objectId: object._id, jobNumber: 0 });
                break;
              case 'Ошибка регистрации':
                // вся отправка Обьект создан с самого начала
                agenda.now('createObject', { objectId: object._id, jobNumber: 0 });
                break;
              default:
                // проставляем статус SENDING для отображения желтого кружочка
                await updateRest(restId, { status: 'SENDING' });
                // отправить запрос на смену статуса
                return await sendObjectChangeStatus(object, system, restId);
            }*/
          } else {
            logger.error(`Метод repeatRestRequest restId=${restId} - Обьект с id=${rest.objectID} не найден`);
            return {
              status: 'ERROR',
              message: `Обьект с id=${rest.objectID} не найден`
            }
          }
          break;
        default:
          logger.error(`Метод repeatRestRequest rest.tableName=${rest.tableName} id=${rest.objectID} - Для данной таблицы повторение запросов не поддерживается`);
          return {
            status: 'ERROR',
            message: `Для данной таблицы повторение запросов не поддерживается`
          }
      }
    } else {
      logger.error(`Метод repeatRestRequest cистема с id=${rest.systemId} не найдена`);
      return {
        status: 'ERROR',
        message: `Система с id=${rest.systemId} не найдена`
      }
    }
  } else {
    logger.info(`Метод repeatRestRequest конфигурация запроса с id=${restId} не найдена или запрос уже выполнен успешно`);
    return {
      status: 'ERROR',
      message: `Конфигурация запроса с id=${restId} не найдена или запрос уже выполнен успешно`
    }
  }
}

/**
 * Обновление записи отправки события в таблицу Rest
 * @param {string} id - id обьекта rest
 * @param {string} data - данные для обновления обьекта
 * @returns {Object} {status: , error: }
 */
const updateRest = async function (id, data) {
  try {
    //let repeatJobCount = await SettingModel.model.findOne({ 'name': 'repeatJobCount' });
    //let repeatJobInterval = await SettingModel.model.findOne({ 'name': 'repeatJobInterval' });

    //if (repeatJobCount && repeatJobInterval) {
    let rest = await RestModel.model.findOne({ '_id': id });
    let needRepeatSending = false;
    let repeatParams;

    if (rest) {
      if (rest['type'] === 'Исходящий') {
        repeatParams = await resendingController.getRepeatIntervalAndTotal(rest['sendTriesCount']);
        needRepeatSending = data['status'] === 'ERROR' && repeatParams && repeatParams.countTotal && Number(repeatParams.countTotal) > rest['sendTriesCount'] && rest.status !== 'SUCCESS';
      }
      // отправляем повторно только если обьект не в статусе Новое или Ошибка регистрации. Если статус Новое или Ошибка регистрации, 
      // то повторная отправка обьекта несколько раз делается отдельным job
      if (rest.tableName === 'object') {
        //const object = await ObjectModel.model.findOne({ '_id': new ObjectId(rest.objectID) });
        //(!object || object.Status === 'Новый' || object.Status === 'Ошибка регистрации')
        if (rest.action === 'createObject') { 
          needRepeatSending = false;
        } else if (data['status'] === 'ERROR' && !needRepeatSending) {
          agenda.now('sendUpdateIntegrationError', { restId: rest._id });
        }
      }

      if (data['status'] !== 'SENDING') {
        rest['sendTriesCount'] = rest['sendTriesCount'] + 1;
      }

      for (prop in data) {
        if (data[prop]) {
          switch (prop) {
            case 'result':
              const newResult = data.result;

              if (rest.result) {
                rest.result = [newResult, ...rest.result];
              } else {
                rest.result = [newResult];
              }

              break;
            default:
              rest[prop] = data[prop];
              break;
          }
        }
      }

      const saveResult = await rest.save();

      if (needRepeatSending) {
        if (repeatParams && repeatParams.countTotal && repeatParams.interval) {
          let scheduleDate = new Date();
          scheduleDate.setSeconds(scheduleDate.getSeconds() + Number(repeatParams.interval));
          agenda.schedule(scheduleDate, 'repeatRestRequest', { restId: id });
        } else {
          logger.error(`Метод updateRest ошибка получения записей таблицы resending`);
        }
      }
      return rest;
    }

    return null;
  } catch (error) {
    logger.error(`Метод updateRest id=${id} data=${stringify(data)} - ${stringify(error)}`);
  }
}

/**
 * Добавление записи отправки события в таблицу Rest
 * @param {string} url - адрес, на который направлен запрос
 * @param {string} id - Объект.ID - Объект, по которому отправлен/получен запрос
 * @param {string} request - Запрос
 * @param {string} type - Тип
 * @param {string} status - Статус
 * @param {string} tableName - имя таблицы
 * @param {string} systemId - ИД системы, в которую направлен запроc
 * @param {string} action - Действие
 * @param {string} info - Дополнительная информация
 * @returns {Object} {status: , error: }
 */
const createRest = async function (url, id, request, type, status, tableName, systemId, action, info, ip) {
  try {
    const rest = new RestModel.model({
      ip: ip,
      url: url,
      objectID: id,
      data: new Date(),
      status: status,
      request: request,
      type: type,
      tableName: tableName,
      systemId: systemId,
      action: action
    });

    if (type === 'Исходящий') {
      rest.sendTriesCount = 0;
    }

    if (info) {
      rest.info = info;
    }

    await rest.save();

    return rest;
  } catch (error) {
    logger.error(`Метод createRest ip=${ip} url=${url} id=${id} request=${stringify(request)} - ${stringify(error)}`);
    return {
      status: 'ERROR',
      error: error
    }
  }
}

/**
 * Получение записи конфигурации запросов
 * @param {Object} req
 * @param {Object} res
 */
const getRest = async function (req, res) {
  try {
    const id = req.params.id;
    const rest = await RestModel.model.findOne({ '_id': new ObjectId(id) });

    if (rest) {
      res.send(rest);
    } else {
      logger.error(`Метод getRest Обьект с кодом ${id} не найден`);
      res.status(400).send({ status: 'ERROR', message: `Обьект с кодом ${id} не найден` });
    }

  } catch (error) {
    logger.error(`Метод getRest - ${stringify(error)}`);
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
const getRestList = async function (req, res) {
  const { page, size } = req.body;
  let searchParams = req.body.searchParams || {};
  searchParams = prepareSearchParams(searchParams, RestModel.scheme.obj);

  try {
    const { limit, offset } = getPagination(page, size);

    RestModel.model.paginate(searchParams, { offset, limit, populate: 'systemId', sort: { 'createdAt': -1 } })
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
          currentPage: data.page - 1,
        });
      })
      .catch((error) => {
        logger.error(`Метод getRestList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
        res.status(500).send({
          status: 'ERROR',
          message: error.message || 'Ошибка получения записей',
        });
      });

  } catch (error) {
    logger.error(`Метод getRestList page=${page} size=${size} searchParams=${stringify(searchParams)} - ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  createRest,
  updateRest,
  getRest,
  getRestList,
  sendRestRequest,
  repeatRestRequest,
  repeatRequest,
  sendObjectRequest,
  sendObjectChangeStatus
}