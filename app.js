const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const express = require('express');
const cfg = require('./config');
const authJwt = require('./middlewares/authJwt');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const objectController = require('./controllers/object');
const stpController = require('./controllers/stp');
const resendingController = require('./controllers/resending');
const systemController = require('./controllers/system');
const userController = require('./controllers/user');
const restController = require('./controllers/rest');
const settingController = require('./controllers/setting');
const emailController = require('./controllers/email');
const monitoringController = require('./controllers/monitoring');
const RestModel = require('./models/rest');
const port = cfg.port;
const basicAuth = require('./middlewares/basicAuth');
const whiteListAuth = require('./middlewares/whiteListAuth');
const winston = require('winston');
const expressWinston = require('express-winston');
const Moment = require('moment-timezone');
//const attachmentController = require('./controllers/attachment');
//const multer = require('multer');
//const upload = multer({ dest: cfg.filesUploadPath });

try {
   const restartNotifyEnvs = cfg.mailOptions?.restartNotifyEnvs ? cfg.mailOptions.restartNotifyEnvs.split(',') : [];
   const restartNotifyRecievers = cfg.mailOptions?.restartNotifyRecievers ? cfg.mailOptions.restartNotifyRecievers.split(',') : [];
   if (restartNotifyEnvs && restartNotifyRecievers && restartNotifyEnvs.indexOf(cfg.environment) >= 0 && restartNotifyRecievers.length > 0) {
      console.log('Отправка email о рестарте');
      const restartTime = Moment(new Date()).tz('Europe/Moscow').format('DD-MM-YYYY HH:mm:ss');
      const restartEmailText = `Система ApiGate перезапущена ${restartTime}.
      \n\nСообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.`;
      const restartEmailHtml = `<style> p {line-height: 2; }</style><p>Система ApiGate перезапущена ${restartTime}.
      <br><br>Сообщение создано автоматически. Пожалуйста, не отвечайте на это письмо.</p>`;
      emailController.sendEmail('Выполнен перезапуск Системы', 'Система ApiGate перезапущена', restartEmailText, restartEmailHtml, restartNotifyRecievers);
   }
} catch (error) {
   console.log('Ошибка отправки письма о рестарте');
}

app.use(cors());
app.use(
   cookieSession({
      signed: false,
      secure: true
   })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(basicAuth);

app.use(expressWinston.logger({
   transports: [
      new winston.transports.File({
         filename: cfg.logFolder + '/express.log',
         maxsize: cfg.logMaxSize,
         maxFiles: cfg.logMaxFiles,
         tailable: true
      })
   ],
   format: winston.format.combine(
      winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
      winston.format.json()
   ),
   meta: false,
   msg: 'HTTP  ',
   expressFormat: true,
   colorize: false,
   ignoreRoute: function (req, res) { return false; }
}));

mongoose.connect(cfg.mongoUrl, {
   useUnifiedTopology: true
})
   .then(async (client) => {
      // в случае, если запрос остался в SENDING на момент падения сервиса, нужно его перезапустить повторно - устанавливаем статус ERROR и создается джоб на повторение
      const rests = await RestModel.model.find({ status: 'SENDING' });
      rests.forEach(async (rest) => {
         await restController.updateRest(rest._id, { status: 'ERROR' });
      });

      //повторение запроса
      app.post(cfg.paths.get('repeatRequest'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         restController.repeatRequest(req, res);
      });

      app.post(cfg.paths.get('objectChangeStatus4me'), (req, res, next) => { whiteListAuth.verifyAccount(req, res, next) }, (req, res) => {
         objectController.changeStatus4me(req, res);
      });

      // Статус изменен
      // Обращение отклонено
      app.put(cfg.paths.get('objectChangeStatus'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         objectController.changeStatus(req, res);
      });

      // списки данных по таблицам с пагинацией
      app.post(cfg.paths.get('objectList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         objectController.getObjectList(req, res);
      });

      app.post(cfg.paths.get('restList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         restController.getRestList(req, res);
      });

      app.post(cfg.paths.get('stpList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         stpController.getStpList(req, res);
      });

      // 77017
      app.post(cfg.paths.get('resendingList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         resendingController.getResendingList(req, res);
      });

      app.post(cfg.paths.get('userList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         userController.getUserList(req, res);
      });

      app.post(cfg.paths.get('systemList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         systemController.getSystemList(req, res);
      });

      app.post(cfg.paths.get('settingList'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         settingController.getSettingList(req, res);
      });

      // Cоздание обьекта
      // Регистрация обьекта
      // Сообщить Системе-Источнику о регистрации Обращения в Системе-Получателе
      app.post(cfg.paths.get('object'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => { //upload.array('files'), 
         objectController.createObject(req, res);
      });

      // Обновление обьекта
      app.put(cfg.paths.get('object'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         objectController.saveObject(req, res);
      });

      // Получение данных обьекта
      app.get(cfg.paths.get('object'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         objectController.getObject(req, res);
      });

      // Сообщить всем Системам из таблицы «Система» о наличии новой записи в таблице «СТП»
      app.post(cfg.paths.get('stp'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         stpController.createSTP(req, res);
      });

      // обновление данных стп с фронта
      app.put(cfg.paths.get('stp'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         stpController.saveSTP(req, res);
      });

      // получение данных STP
      app.get(cfg.paths.get('stp'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         stpController.getSTP(req, res);
      });

      // получение данных повторной отправки
      app.get(cfg.paths.get('resending'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         resendingController.getResending(req, res);
      });

      // обновление данных повторной отправки
      app.put(cfg.paths.get('resending'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         resendingController.saveResending(req, res);
      });

      // добавление данных настройки
      app.post(cfg.paths.get('setting'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         settingController.createSetting(req, res);
      });

      // обновление данных настройки
      app.put(cfg.paths.get('setting'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         settingController.saveSetting(req, res);
      });

      // получение данных настройки
      app.get(cfg.paths.get('setting'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         settingController.getSetting(req, res);
      });

      // добавление записи system
      app.post(cfg.paths.get('system'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         systemController.createSystem(req, res);
      });

      //обновление записи system
      app.put(cfg.paths.get('system'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         systemController.saveSystem(req, res);
      });

      // получение записи system
      app.get(cfg.paths.get('system'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         systemController.getSystem(req, res);
      });

      // получение записи rest
      app.get(cfg.paths.get('rest'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         restController.getRest(req, res);
      });

      // для user делает Сергей
      // авторизация пользователя
      app.post(cfg.paths.get('signin'), (req, res) => {
         userController.signinUser(req, res);
      });
      //logout
      app.post(cfg.paths.get('signout'), (req, res) => {
         userController.signoutUser(req, res);
      });
      //регистрация пользователя
      app.post(cfg.paths.get('signup'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         userController.signupUser(req, res);
      })
      // получение пользователя
      app.get(cfg.paths.get('user'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         userController.getUser(req, res);
      })
      //обновление пользователя
      app.put(cfg.paths.get('user'), (req, res, next) => { authJwt.verifyToken(req, res, next, 'Admin') }, (req, res) => {
         userController.saveUser(req, res);
      })

      // получение джобов для мониторинга
      app.get(cfg.paths.get('jobfail'), (req, res, next) => { authJwt.verifyToken(req, res, next, ['Admin', 'System']) }, (req, res) => {
         monitoringController.getJobList(req, res);
      })

      // отдельное добавление вложения - не используется
      //app.post(cfg.paths.get('attachment'), upload.array('files'), (req, res) => {
      //   attachmentController.addAttachments(req, res);
      //});

      app.listen(port, () => {
         console.log('We are live on ' + port);
      });
   })
   .catch((error) => { console.error(error) })