module.exports = function (agenda) {
  agenda.define('repeatRestRequest', async (job) => {
    const restController = require('../controllers/rest');
    const restId = job.attrs.data.restId;
    
    restController.repeatRestRequest(restId);
  });
};