const { stringify } = require('../utils');
const logger = require('../middlewares/logger');
const agenda = require('../agenda.js');
//const cfg = require('../config');

/**
 * Получение списка записей с пагинацией и поиском 
 * @param {Object} req
 * @param {Object} res
 */
const getJobList = async function (req, res) {
  try {
    const jobs = await agenda.jobs({'nextRunAt':{$ne:null}});

    res.send(jobs);
  } catch (error) {
    logger.error(`Метод getJobList ошибка: ${stringify(error)}`);
    res.status(500).send({
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  getJobList
}