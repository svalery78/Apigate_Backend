/*
После добавления новой записи в таблицу «СТП» (см. п.1.1.2.2.3) должны выполняться действия:
1.	В WS всех Системам из таблицы «Система» (см. п. 1.1.2.2.2) отправить запрос по событию «Добавлена СТП». 
*/
const StpModel = require('../models/stp');
const SystemModel = require('../models/system');
const { formatData, getParams } = require('../utils');

module.exports = function (agenda) {
  agenda.define('createSTP', async (job) => {
    const restController = require('../controllers/rest');
    const stpId = job.attrs.data.stpId;
    const stp = await StpModel.model.findOne({ '_id': stpId });
    const System = await SystemModel.model.findOne({ '_id': stp.SystemID });
    const WSSystems = await SystemModel.model.find({});
    let serviceName;

    WSSystems.forEach((WSSystem) => {
      const url = WSSystem.StpWSUrlPath ? WSSystem.WSUrlBase + WSSystem.StpWSUrlPath : WSSystem.WSUrlBase;

      if (WSSystem.type === 'sm') {
        serviceName = url.substring(url.lastIndexOf('/') + 1);
      }
  
      let data = {
        'ID': stp._id.toString(),
        'Name': stp.name,
        'SystemID': stp.SystemID.toString(),
        'SystemName': System.name,
        //'WSUrlPath': stp.WSUrlPath,
        'blocking': stp.blocking
      }
      const sendedData = formatData(data, WSSystem.type, serviceName);
      const params = getParams(WSSystem);

      // отправляем данные во внешнюю систему
      restController.sendRestRequest('post', url, sendedData, params, stpId, 'stp', WSSystem, serviceName, 'createStp');
    });
  });
};

