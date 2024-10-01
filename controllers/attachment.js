/* методы для работы с вложениями через файловую систему. Было решено делать через ссылки, но сохранить данный функционал закомментированным */

/*var fs = require('fs');
const { getParams, needSlash } = require('../utils');
const restController = require('../controllers/rest');
const SystemModel = require('../models/system');
const axios = require('axios');
const ObjectId = require('mongodb').ObjectId;
const transliteration = require('transliteration.cyr');
const { sendWithQueue } = require('../middlewares/queue');

// старая версия, прием и загрузка файлов
const sendAttachments = async function (WSSystem, files, addresseeObjectCode, objectId) {
  //Если вложений много, строим очередь последовательных запросов
  const queue = new PQueue({ concurrency: 1 });
  const queueArr = files.map(file => {
    //Использую синхронное чтение файла намеренно, чтобы, если файлов много, не начался вал одновременных запросов в SM
    const readFile = fs.readFileSync(file.path);
    return () => {
      if (WSSystem.type === 'sm') {
        sendAttachToSM(WSSystem, readFile, file.originalname, addresseeObjectCode, objectId, 'sm');
      } else {
        sendAttach(WSSystem, readFile, file.originalname, addresseeObjectCode, objectId);
      }
    }
  });

  // удаление файлов
  queue.addAll(queueArr).then(() => {
    files.forEach((file) => {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error('Ошибка при удалении временного файла при добавлении вложения: ', err);
          return;
        }
      });
    });
  })
  .catch((error) => {
  });
};

// отправка вложения в систему типа SM - не используется, перешли на ссылки
const sendAttachToSM = async (WSSystem, file, filename, addresseeObjectCode, objectId, systemType) => {
  try {
    const response = await restController.sendRestRequest(`${WSSystem.WSUrlAttach}/${addresseeObjectCode}/attachments`, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${transliteration.transliterate(filename)}"`, //SM не умеет принимать русские названия даже в UTF-8
        ...WSSystem.WSHeader // возможно для вложений отдельные заголовки нужны
      }
    }, objectId, systemType);
  } catch (error) {
  }
}

// добавление вложений отдельно - пока не используется
const addAttachments = async function (req, res) {
  try {
    // если происходит добавление через form-data, файлы сохраняются автоматически
    // TODO: уточнить, каким образом должно происходить добавление файлов в object
    if (req.files) {
      // TODO: добавлеяем в object

      res.send({
        status: 'success',
        message: 'Файл ' + req.headers.filename + ' успешно добавлен'
      });
    } else {
      if (req.headers.filename) {
        req.setEncoding('binary');

        let chunks = [];

        req.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk, 'binary'));
        });

        req.on('end', () => {
          let binary = Buffer.concat(chunks);
          fs.writeFile(req.headers.filename, binary, 'binary', (err) => {
            if (err) {
              res.status(500).send({
                status: 'error',
                message: err
              });
            } else {
              // TODO: добавлеяем в object

              res.send({
                status: 'success',
                message: 'Файл ' + req.headers.filename + ' успешно добавлен'
              });
            }
          });
        });
      }
    }
  } catch (error) {
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};*/

module.exports = {
  //sendAttachments,
  //addAttachments
}


