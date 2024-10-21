const ObjectModel = require('../models/object');
const SystemModel = require('../models/system');
const resendingController = require('../controllers/resending');
const ObjectId = require('mongodb').ObjectId;
const { getCreateObjStatus, getRequestUrl } = require('../utils');
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
    const resheduleCreateObj = async (object, jobNumber, noReply) => {
      //let repeatJobCount = await SettingModel.model.findOne({ 'name': 'repeatJobCount' });
      //let repeatJobInterval = await SettingModel.model.findOne({ 'name': 'repeatJobInterval' });
      const repeatParams = await resendingController.getRepeatIntervalAndTotal(jobNumber);
      //if (repeatJobCount && repeatJobInterval) {
      /*	Через n-минут* в WS Системы-Получателя повторно отправить запрос по событию «Объект создан»*/
      //if (jobNumber < Number(repeatJobCount.value)) {
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
            if (!noReply) {
              agenda.now('changeStatus', { objectId: object._id });
            }
          }
          agenda.now('sendCreateIntegrationError', { objectId: object._id });
        }
      }
      /*} else {
        if (object.Status !== 'Ошибка регистрации') {
          await objectController.changeData(object._id, {
            Status: 'Ошибка регистрации'
          });
          agenda.now('changeStatus', { objectId: object._id });
        }
        agenda.now('sendCreateIntegrationError', { objectId: object._id });
      }*/
    }

    const objectId = job.attrs.data.objectId;
    let object = await ObjectModel.model.findOne({ '_id': objectId });

    if (object) {
      const SystemAddressee = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemAddresseeID) });
      const SystemSource = await SystemModel.model.findOne({ '_id': new ObjectId(object.SystemSourceID) });

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
        SystemAddresseeName: SystemAddressee.name,
        SystemAddresseeSTPID: object.SystemAddresseeSTPID.toString()
        //SystemSourceAttach: object.SystemSourceAttach
      }

      let customFields = {};
      for (field in object.CustomFields) {
        customFields[field] = object.CustomFields[field].value;
      }

      data = { ...baseData, ...{ customFields: customFields } };

      if (SystemAddressee.type == 'json') {
        switch (SystemAddressee.DataStructure) {
          case '4me (json)':
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
            break;
          case 'telegram':
            data = {
              'chat_id': data.customFields.ChatId, // || SystemAddressee.chatId, // хотели сначала на стороне системы указывать, но потом передумали
              'parse_mode': data.customFields.ParseMode, // || SystemAddressee.parseMode,
              // TODO: тут шаблон какой-то надо сделать, со вставками-переменными? Пока будет на стороне 4me или стандартный
              'text': data.customFields.Text || 'Зарегистрирован запрос ' + baseData.SystemSourceObjCode
            }
            break;
          //ditRESTOutSystems['url'] + '/' + addParams['method'] + '?';
          default: // sm
            data = baseData;
            if (object.SystemSourceСomment) {
              data['SystemSourceСomment'] = object.SystemSourceСomment;
            }
            break;
        }
      }

      if (object.Status !== 'Зарегистрирован' || !object.SystemAddresseeObjCode) {
        const SystemAddresseeParams = { ...SystemAddressee._doc, url: getRequestUrl(data, SystemAddressee.url) };
        const createResult = await restController.sendObjectRequest(objectId, 'object', SystemAddresseeParams, data, object.SystemSourceID, 'createObject');

        if (createResult.systemObjectCode) {
          const updatedObject = await objectController.changeData(object._id, {
            Status: getCreateObjStatus(createResult, SystemAddressee.type, SystemAddressee.DataStructure),
            SystemAddresseeObjCode: createResult.systemObjectCode
          });

          if (!SystemSource.noReply && updatedObject.status === 'SUCCESS') { //if (updateObject.modifiedCount === 1) {
            agenda.now('changeStatus', { objectId: object._id });
          }
        } else {
          object = await ObjectModel.model.findOne({ '_id': objectId });
          if (object.Status === 'Ошибка регистрации' || object.Status === 'Новый') { // def 9104
            // закомментировано по 1586
            /*if (object.Status !== 'Ошибка регистрации') {
              await objectController.changeData(object._id, {
                Status: 'Ошибка регистрации' 
              });
              agenda.now('changeStatus', { objectId: object._id });
            }*/
            resheduleCreateObj(object, job.attrs.data.jobNumber, SystemSource.noReply);
          }
        }
      }
    } else {
      // убрала этот кусок, тк обьект не существует
      /* if (object.Status !== 'Ошибка регистрации') {
        await objectController.changeData(object._id, {
          Status: 'Ошибка регистрации'
        });
        agenda.now('changeStatus', { objectId: object._id });
      }*/
      agenda.now('sendCreateIntegrationError', { objectId: objectId });
    }
  });
};