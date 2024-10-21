const Agenda = require('agenda');
const cfg = require('./config');
const logger = require('./middlewares/logger');
const agenda = new Agenda({
  db: cfg.agenda.database
});
const jobTypes = ['createObject', 'changeStatus', 'email/sendCreateIntegrationError', , 'email/sendUpdateIntegrationError',
  'createSTP', 'updateSTP', 'repeatRestRequest'];
const { MongoClient } = require('mongodb');

jobTypes.forEach((type) => {
  require('./jobs/' + type)(agenda);
});

(async function () {
  console.log('стартуем Agenda');
  try {
    const client = await MongoClient.connect(cfg.agenda.database.address, {
      connectTimeoutMS: 120000,
      serverSelectionTimeoutMS: 120000
    });
    const agendaJobs = client.db().collection('agendaJobs');

    const updateResult = await agendaJobs.updateMany({
      lockedAt: {
        $exists: true,
      },
      lastFinishedAt: {
        $exists: false,
      },
    },
      {
        $unset: {
          lockedAt: undefined,
          lastModifiedBy: undefined,
          lastRunAt: undefined,
        },
        $set: {
          nextRunAt: new Date(),
        },
      },
      {
        multi: true,
      })
    console.log('Будет перезапущено заданий: ', updateResult.modifiedCount);
  } catch (error) {
    console.log(`Ошибка обновления заданий при рестарте сервера: ${error}`);
    logger.error(`Ошибка обновления заданий при рестарте сервера: ${error}`);
  }
  await agenda.start();
})();

module.exports = agenda;