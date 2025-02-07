const CryptoJS = require('crypto-js');
const cfg = require('./config');
const ObjectId = require('mongodb').ObjectId;

//Получить дополнительную информацию по результату обработки запроса
const getMessage = (data, status, messages) => {
   if (!data) { return 'Не удалось получить данные'; }
   if (status === 'SUCCESS') { return 'Успех'; }
   const msgTxt = messages && messages.length > 0 ? messages : data;
   return msgTxt;
}

//Преобразование строку в json
const parseJsonString = (str) => {
   try {
      return JSON.parse(str);
   } catch (e) {
      return str;
   }
}

//Преобразование строку в json
const stringify = (obj) => {
   try {
      if (typeof obj === 'object') {
         return JSON.stringify(obj);
      }
      return obj;
   } catch (e) {
      return obj;
   }
}

// получение данных об ошибке
const getErrorText = (error) => {
   try {
      if (typeof error === 'object') {
         const retError = {
            code: error.code,
            syscall: error.syscall
         };

         if (error.response) {
            retError.response = {
               data: error.response.data,
               status: error.response.status,
               headers: error.response.headers,
               config: {
                  url: error.response.config?.url,
                  method: error.response.config?.method,
                  data: error.response.config?.data
               }
            }
         }

         if (error.result) {
            retError.result = error.result;
         }

         if (error.isAxiosError && error.toJSON) {
            const errorObj = error.toJSON(error);

            retError.message = errorObj.message;
            retError.errorName = errorObj.name;
            retError.stack = errorObj.stack;
         }

         return retError;
      }

      return error;
   } catch (catchedError) {
      return {
         message: 'Не удалось получить текст ошибки',
         error: catchedError
      }
   }
}

// получение результата выполнения запроса
const getResponseData = (responseObj, systemType, serviceName) => {
   if (systemType === 'sm') {
      if (serviceName) {
         if (responseObj.data[serviceName] && responseObj.data[serviceName].response) {
            return responseObj.data[serviceName].response;
         }
         return {
            status: responseObj.status === 200 ? 'SUCCESS' : responseObj.status,
            ...responseObj.data[serviceName]
         }
      } else if (responseObj.data.attachment && responseObj.data.attachment.href) { // ссылка на вложение заполенена
         return {
            status: 'SUCCESS',
            ...responseObj.data.attachment
         }
      }
   }

   return responseObj.data.response ? responseObj.data.response : responseObj.data;
}

// получение данных об обновлении записи
const getModifiedText = (writeResult) => {
   if (writeResult.matchedCount === 0) {
      return 'Запись не найдена';
   }

   if (writeResult.modifiedCount === 0) {
      return 'Ошибка сохранения записи';
   }

   return error;
}

// фоматирование данных запроса для отправки
const formatData = (data, systemType, serviceName, type) => {
   let formattedData = { ...data };

   if (systemType !== 'sm') {
      formattedData['actionDate'] = new Date();
   }

   if (systemType === 'sm' && serviceName) {
      formattedData = {
         [serviceName]: type === 'string' ? { data: JSON.stringify(formattedData) } : formattedData
      }
   } else if (systemType !== 'json') {
      formattedData = type === 'string' ? JSON.stringify(formattedData) : formattedData;
   }

   return formattedData;
}

// получение параметров запроса (заголовки и тд)
const getParams = (WSSystem) => {
   let headers = {};
   if (WSSystem.WSLogin && WSSystem.WSPassword) {
      headers = {
         'Authorization': 'Basic ' + Buffer.from(`${WSSystem.WSLogin}:${CryptoJS.AES.decrypt(WSSystem.WSPassword, cfg.secret).toString(CryptoJS.enc.Utf8)}`).toString('base64'),
      }
   }
   let params = {
      headers: {
         ...headers,
         ...WSSystem.WSHeader
      }
   };

   return params;
}

//необходимость слеша
const needSlash = (url) => {
   return url && url.length > 0 && url.lastIndexOf('/') !== url.length - 1;
}

// пагинация для списков
const getPagination = (page, size) => {
   const limit = size ? +size : 1000;
   const offset = page && page > 1 ? (page - 1) * limit : 0;

   return { limit, offset };
};

// получение имени сервиса для системы типа sm
const getServiceName = (systemType, url) => {
   let serviceName = null;
   if (systemType === 'sm') {
      serviceName = url.substring(url.lastIndexOf('/') + 1);
   }

   return serviceName;
}

// получение URL для отправки вложений
const getAttachURL = (WSSystem) => {
   if (WSSystem.WSUrlAttach) {
      return WSSystem.WSUrlBase + (needSlash(WSSystem.WSUrlBase) ? '/' : '') + WSSystem.WSUrlAttach;
   }

   return WSSystem.WSUrlBase;
}

/**
 * Получение длины массива (необходимо для параметров, передаваемых внешней системы через запрос, тк в параметрах могут передать все что угодно)
 * @param {void} value
 * @returns {Number} Длина
 */
const getArrayLength = (value) => {
   try {
      if (typeof value === 'object' && value.length) {
         return value.length;
      }

      return 0;
   } catch (error) {
      return 0;
   }
}

/**
 * Получение строки дополнительной информации при отправке запроса
 * @param {String} tableName
 * @param {Object} data
 * @returns {String}
 */
const getRestInfo = (tableName, data) => {
   try {
      switch (tableName) {
         case 'attachment':
            if (data.filename || data.filesize) {
               return `Имя файла: ${decodeURI(data.filename)}, размер файла: ${data.filesize}`;
            }
            break;
      }

      return null;
   } catch (error) {
      return null;
   }
}

/**
 * Подготовка строки поиска
 */
const prepareSearchParams = (searchParams, scheme) => {
   try {
      // if (searchParams._id) {
      //    searchParams._id = new ObjectId(searchParams._id);
      // }

      for (param in searchParams) {
         if (scheme && scheme[param] && scheme[param].ref) {
            searchParams[param] = new ObjectId(searchParams[param]);
         }
      }

      return searchParams;
   } catch (error) {
      return searchParams;
   }
}

/**
 * Проверка на путь для систем, не поддерживающих автоизацию (типа 4me)
 */
const isVerifiedPath = (url) => {
   return url.indexOf('/sysrouter/trusted/') === 0
}

// получение статуса запроса
const getResponseStatus = (status, requestStatus, url) => {
   const statuses = ['SUCCESS', 'ERROR', 'SENDING'];
   let result = 'ERROR';

   if (status && statuses.includes(status)) {
      result = status;
   } else if (requestStatus === 201 || requestStatus === 200) {
      result = 'SUCCESS';
   }

   return result;
}

// получение кода созданного обьекта
const getObjCode = (data, systemType) => {
   if (systemType == 'json') {
      return data.id
   }

   return data.SystemAddresseeObjCode;
}

module.exports = {
   getMessage,
   parseJsonString,
   getErrorText,
   getResponseData,
   getModifiedText,
   getParams,
   formatData,
   needSlash,
   getPagination,
   getServiceName,
   getAttachURL,
   getArrayLength,
   getRestInfo,
   prepareSearchParams,
   isVerifiedPath,
   getResponseStatus,
   getObjCode,
   stringify
};