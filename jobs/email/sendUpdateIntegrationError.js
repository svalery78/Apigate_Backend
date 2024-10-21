const nodemailer = require('nodemailer');
const RestModel = require('../../models/rest');
const ObjectModel = require('../../models/object');
const SystemModel = require('../../models/system');
const ObjectId = require('mongodb').ObjectId;
const logger = require('../../middlewares/logger');

module.exports = function (agenda) {
  agenda.define('sendUpdateIntegrationError', async (job) => {
    const restId = job.attrs.data.restId;
    const rest = await RestModel.model.findOne({ '_id': restId});
    const object = await ObjectModel.model.findOne({ '_id': rest.objectID });

    if (object) {
      const WSSystem = await SystemModel.model.findOne({ '_id': new ObjectId(rest.systemId) });
      if (WSSystem) {
        const lastRequest = JSON.stringify(rest.result[0]);

        /* Ответственному за интеграцию со стороны Системы-Получателя отправлено почтовое оповещение о сбое в интеграции.*/
        const transporter = nodemailer.createTransport({
          host: 'owa.mos.ru',
          port: 587,
          auth: {
            user: 'noreply-apigate',
            pass: 'Ee4@2$VhNeW'
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
          from: 'noreply-apigate@it.mos.ru',
          to: WSSystem.ResponsibleEmail,
          subject: 'Проблемы с обновлением Обращения',
          text: `В Вашу Систему «${WSSystem.name}» отправлен запрос на обновление Обращения.\n`
            + `Время на обновление истекло, но успешный ответ на запрос не получен. \nНеобходимо проверить корректность настроек интеграции с APIGate.\n`
            + `Объект.ID: ${rest.objectID}\n`
            + `Ответ на запрос: ${lastRequest}\n`
            + `Данное сообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.`,
          html: '<style> p {line-height: 2; }</style> <p>В Вашу Систему «' + WSSystem.name + '» отправлен запрос на обновление Обращения.<br>'
            + 'Время на обновление истекло, но успешный ответ на запрос не получен. <br>Необходимо проверить корректность настроек интеграции с APIGate.<br><br>'
            + '<b>Объект.ID: </b>' + rest.objectID + '<br>'
            + '<b>Ответ на запрос: </b>' + lastRequest + '<br><br>'
            + 'Данное сообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.</p>',
        }

        //Отправляем письмо
        transporter.sendMail(mailOptions, (error, response) => {
          if (error) {
            logger.error(`Ошибка отправки письма по смене статуса ${WSSystem.ResponsibleEmail} по объекту ${rest.objectID}: - ${error}`);
          } else {
            logger.info(`Письмо ошибки смены статуса отправлено ${WSSystem.ResponsibleEmail} по объекту ${rest.objectID}`);
          }
        });
      }
    }
  });
};