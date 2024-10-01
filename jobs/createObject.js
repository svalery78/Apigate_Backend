const ObjectModel = require('../models/object');
const SystemModel = require('../models/system');
const resendingController = require('../controllers/resending');
const ObjectId = require('mongodb').ObjectId;
//const SettingModel = require('../models/setting');
//var { transform } = require('node-json-transform');

module.exports = (agenda) => {
  agenda.define('createObject', async (job) => {
    const objectController = require('../controllers/object');
    const restController = require('../controllers/rest');
    /**
     * Перешедуливание планировщика 
     * @param {Object} object
     * @param {String} jobNumber
    */
   //ФТ_801633 - закомментировано
    /*const resheduleCreateObj = async (object, jobNumber) => {
      const repeatParams = await resendingController.getRepeatIntervalAndTotal(jobNumber);
      if (repeatParams.countTotal && repeatParams.interval) {
        let scheduleDate = new Date();
        scheduleDate.setSeconds(scheduleDate.getSeconds() + Number(repeatParams.interval));
        agenda.schedule(scheduleDate, 'createObject', { objectId: object._id, jobNumber: jobNumber + 1 });
      } else {
        if (object && (object.Status === 'Ошибка регистрации' || object.Status === 'Новый')) {
          if (object.Status !== 'Ошибка регистрации') {
            await objectController.changeData(object._id, {
              Status: 'Ошибка регистрации'
            });
            agenda.now('changeStatus', { objectId: object._id });
          }
          agenda.now('sendCreateIntegrationError', { objectId: object._id });
        }
      }
    }*/

    const objectId = job.attrs.data.objectId;
    const type = job.attrs.data.type;
    let object = await ObjectModel.model.findOne({ '_id': objectId });

    if (object) {
      const WSSystem = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemAddresseeID) });
      let data;
      let baseData = {
        service: object.service,
        action: 'objCreate',
        ID: object._id.toString(),
        Status: object.Status,
        DescriptionShort: object.DescriptionShort,
        DescriptionFull: object.DescriptionFull,
        ContactFIO: object.ContactFIO,
        ContactEmail: object.ContactEmail,
        ContactPhone: object.ContactPhone,
        SystemSourceName: object.SystemSourceName,
        SystemSourceObjCode: object.SystemSourceObjCode,
        SystemAddresseeName: WSSystem.name,
        SystemAddresseeSTPID: object.SystemAddresseeSTPID.toString()
      }

      let customFields = {};
      for (field in object.CustomFields) {
        customFields[field] = object.CustomFields[field].value;
      }

      data = { ...baseData, ...{ customFields: customFields } };

      if (WSSystem.type == 'json') {
        if (WSSystem.DataStructure == '4me (json)') {
          const customFieldsMap = {
            'fio': data.ContactFIO,
            'telephone': data.ContactPhone,
            'email': data.ContactEmail,
            'organization': data.customFields.organization,
            'address': data.customFields.address,
            'incident_id': data.SystemSourceObjCode,
            'api_gate_obj_id': data.ID
          }
          let customFieldsArray = [];
          for (mapKey in customFieldsMap) {
            if (customFieldsMap[mapKey]) {
              customFieldsArray.push({ id: mapKey, value: customFieldsMap[mapKey] });
            }
          }

          data = {
            source: data.SystemSourceName,
            sourceID: data.SystemSourceObjCode,
            requested_by_id: data.customFields.requested_by_id,
            requested_for_id: data.customFields.requested_for_id,
            service_instance_id: data.customFields.service_instance_id,
            subject: data.DescriptionShort,
            template_id: data.customFields.template_id,
            category: data.customFields.category,
            note: data.DescriptionFull,
            custom_fields: customFieldsArray
          };
        }
      } else { // sm
        data = baseData;

        if (object.SystemSourceComment) {
          data['SystemSourceComment'] = object.SystemSourceComment;
        }
      }

      if (object.Status !== 'Зарегистрирован' || !object.SystemAddresseeObjCode || type == 'front') {
        // ФТ_801633 - добавлен job.attrs.data.restId
        const createResult = await restController.sendObjectRequest(objectId, 'object', WSSystem, data, object.SystemSourceID, 'createObject', job.attrs.data.restId);

        if (createResult.systemObjectCode) {
          const updatedObject = await objectController.changeData(object._id, {
            Status: 'Зарегистрирован',
            SystemAddresseeObjCode: createResult.systemObjectCode
          });

          if (updatedObject.status === 'SUCCESS') {
            agenda.now('changeStatus', { objectId: object._id });
          }
        }
        //ФТ_801633 - закомментировано
        /*else {
          object = await ObjectModel.model.findOne({ '_id': objectId });
          if (object.Status === 'Ошибка регистрации' || object.Status === 'Новый') { // def 9104
            
            resheduleCreateObj(object, job.attrs.data.jobNumber);
          }
        }*/
      }
    } else {
      if (object.Status !== 'Ошибка регистрации') {
        await objectController.changeData(object._id, {
          Status: 'Ошибка регистрации'
        });
        agenda.now('changeStatus', { objectId: object._id });
      }
      agenda.now('sendCreateIntegrationError', { objectId: object._id });
    }
  });
};