const StpModel = require('../models/stp');
const SystemModel = require('../models/system');
const { formatData, getParams, needSlash } = require('../utils');

module.exports = function (agenda) {
  agenda.define('updateSTP', async (job) => {
    const restController = require('../controllers/rest');
    const stpId = job.attrs.data.stpId;
    const stp = await StpModel.model.findOne({ '_id': stpId });
    const WSSystems = await SystemModel.model.find({});

    WSSystems.forEach((WSSystem) => {
      let serviceName;
      let url = WSSystem.StpWSUrlPath ? WSSystem.WSUrlBase + WSSystem.StpWSUrlPath : WSSystem.WSUrlBase;
      if (WSSystem.type === 'sm') {
        serviceName = url.substring(url.lastIndexOf('/') + 1);
      }
      url = url + (needSlash(url) ? '/' : '') + stp._id;

      let data = {
        //'ID': stp._id.toString(),
        //'Name': stp.name,
        //'SystemID': stp.SystemID.toString(),
        //'SystemName': WSSystem.name,
        //'WSUrlPath': stp.WSUrlPath,
        'blocking': stp.blocking
      }

      const sendedData = formatData(data, WSSystem.type, serviceName);
      const params = getParams(WSSystem);

      // отправляем данные во внешнюю систему
      restController.sendRestRequest('put', url, sendedData, params, stpId, 'stp', WSSystem, serviceName, 'updateStp');
    });
  });
};

