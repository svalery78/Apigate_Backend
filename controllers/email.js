const nodemailer = require('nodemailer');
const logger = require('../middlewares/logger');
const cfg = require('../config');

const sendEmail = async (type, subject, text, html, emails) => {
  const transporter = nodemailer.createTransport({
    host: cfg.mailOptions.host,
    port: cfg.mailOptions.port,
    auth: {
      user: cfg.mailOptions.auth.user,
      pass: cfg.mailOptions.auth.pass
    },
    //Настройки ниже нужны для того, чтобы запросы принимал наш почтовый сервер
    secureConnection: cfg.mailOptions.secureConnection,
    secure: cfg.mailOptions.secure,
    requireTLS: cfg.mailOptions.requireTLS,
    tls: {
      rejectUnauthorized: cfg.mailOptions.tls.rejectUnauthorized
    }
  });

  // письмо
  const mailOptions = {
    from: cfg.mailOptions.from,
    to: emails,
    subject: subject,
    text: text,
    html: html,
  }

  //Отправляем письмо
  transporter.sendMail(mailOptions, (error, response) => {
    if (error) {
      logger.error(`Ошибка отправки письма (${type}) ${emails}: - ${error}`);
      console.log(`Ошибка отправки письма (${type}) ${emails}: - ${error}`);
    } else {
      logger.info(`Письмо (${type}) отправлено ${emails}`);
      console.log(`Письмо (${type}) отправлено ${emails}`);
    }
  });
};

module.exports = {
  sendEmail
}