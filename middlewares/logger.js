const { createLogger, format, transports } = require('winston');
const cfg = require('../config');

// const timezoned = () => {
//   return new Date().toLocaleString('', {
//       timeZone: 'Europe/Moscow'
//   });
// }

const transportsConfig = [
  new (transports.File)({
    filename: cfg.logFolder + '/error.log', 
    level: 'error', 
    format: format.combine(
      format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }), //timezoned
      format.align(),
      format.printf(info => `${info.level}: ${[info.timestamp]}: ${info.message}`),
    ),
    maxsize: cfg.logMaxSize,
    maxFiles: cfg.logMaxFiles,
    tailable: true
  }),
  new (transports.File)({
    filename: cfg.logFolder + '/combined.log',
    level: 'silly', 
    format: format.combine(
      format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }), //timezoned
      format.align(),
      format.printf(info => `${info.level}: ${[info.timestamp]}: ${info.message}`),
    ),
    maxsize: cfg.logMaxSize,
    maxFiles: cfg.logMaxFiles,
    tailable: true
  })
];

if (process.env.APIGATE_BACK_ENV !== 'production') {
  transportsConfig.push(new transports.Console({
    level: 'error'
  }));
}

module.exports = createLogger({
  transports: transportsConfig
});