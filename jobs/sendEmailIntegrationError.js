const nodemailer = require('nodemailer');
const ObjectModel = require('../models/object');
const SystemModel = require('../models/system');
const ObjectId = require('mongodb').ObjectId;

module.exports = function (agenda) {
  agenda.define('sendEmailIntegrationError', async (job) => {
    const objectId = job.attrs.data.objectId;
    const object = await ObjectModel.model.findOne({ '_id': objectId });

    if (object) {
      const WSSystem = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemAddresseeID) });
      if (WSSystem) {
        /* Ответственному за интеграцию со стороны Системы-Получателя отправлено почтовое оповещение о сбое в интеграции.*/
        const transporter = nodemailer.createTransport({
          host: 'owa.mos.ru',
          port: 587,
          auth: {
            user: 'noreply-itsm-echd',
            pass: 'Zf5@xybC'
          },
          //Настройки ниже нужны для того, чтобы запросы принимал наш почтовый сервер
          secureConnection: false,
          secure: false,
          requireTLS: true,
          tls: {
            rejectUnauthorized: false
          }
        });

        // письмо
        const mailOptions = {
          from: 'noreply-itsm-echd@it.mos.ru',
          to: WSSystem.ResponsibleEmail,
          subject: 'Проблемы с регистрацией Обращения, переданного из Внешней СТП',
          text: `В Вашу Систему «${WSSystem.name}» передан Объект из Внешней СТП.`
            + `Время регистрации Объекта истекло, но Объект все еще не создан в Вашей Системе.`
            + `Необходимо проверить корректность настроек интеграции с Внешними СТП.\n`
            + `Внешняя СТП: ${object.SystemSourceName}`
            + `Объект.ID: ${objectId}\n`
            + `Данное сообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.`,
          html: '<style> p {line-height: 2; }</style> <p>В Вашу Систему «' + WSSystem.name + '» передан Объект из Внешней СТП.<br>'
            + 'Время регистрации Объекта истекло, но Объект все еще не создан в Вашей Системе.<br>'
            + 'Необходимо проверить корректность настроек интеграции с Внешними СТП.<br><br>'
            + 'Внешняя СТП: ' + object.SystemSourceName + '<br>'
            + 'Объект.ID: ' + objectId + '<br><br>'
            + 'Данное сообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.</p>',
        }

        //Отправляем письмо
        /*transporter.sendMail(mailOptions, (err, response) => {
          if (err) {
          } else {
          }
        });*/
      }
    }
  });
};