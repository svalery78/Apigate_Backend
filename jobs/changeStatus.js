const ObjectModel = require('../models/object');
const SystemModel = require('../models/system');
const ObjectId = require('mongodb').ObjectId;

module.exports = function (agenda) {
  agenda.define('changeStatus', async (job) => {
    /* 1.	В WS Системы-Источника отправить запрос по событию «Статус изменен». */
    const restController = require('../controllers/rest');
    const objectId = job.attrs.data.objectId;
    let object = await ObjectModel.model.findOne({ '_id': objectId });

    if (object) {
      const WSSystem = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemSourceID) });

      restController.sendObjectChangeStatus(object, WSSystem);
    }
  });
};