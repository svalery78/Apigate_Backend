const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;
const { services } = require('../mapping');

const objectSchema = new Schema({
  Status: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: false
  },
  // Данные Объекта (Обращения)
  DescriptionShort: {
    type: String,
    required: true
  },
  DescriptionFull: {
    type: String,
    required: true
  },
  ContactFIO: {
    type: String,
    required: true
  },
  ContactEmail: {
    type: String,
    //required: true 
  },
  ContactPhone: {
    type: String,
    //required: true
  },
  // Система-Источник
  SystemSourceID: {
    type: Schema.Types.ObjectId, 
    ref: 'system',
    required: true
  },
  SystemSourceName: {
    type: String,
    required: true
  },
  SystemSourceObjCode: {
    type: String,
    required: true
  },
  SystemSourceСomment: {
    type: String
  },
  SystemSourceAttach: {
    type: Array
  },
  // Система-Получатель
  SystemAddresseeID : {
    type: Schema.Types.ObjectId, 
    ref: 'system',
    required: true
  },
  SystemAddresseeSTPID: {
    type: Schema.Types.ObjectId, 
    ref: 'stp',
    required: true
  },
  SystemAddresseeObjCode: {
    type: String,
    // required: true
  },
  SystemAddresseeСomment: {
    type: String,
    // required: true
  },
  SystemAddresseeAttach: {
    type: Array
  },
  CustomFields: {
    type: Object
  },
  service: {
    type: String,
    default: 'ApiGateSysrouter',
    enum: services
  },
  Resolution: {
    type: String
  },
  ResolutionType: {
    type: String
  }
}, {
  timestamps: true
});

objectSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('object', objectSchema);
exports.scheme = objectSchema;
