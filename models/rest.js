const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const restSchema = new Schema({
  tableName: {
    type: String,
    required: true
  },
  objectID: {
    type: Schema.Types.ObjectId,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [ 'Входящий', 'Исходящий' ],
  },
  data: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: [ 'SUCCESS', 'ERROR', 'SENDING', 'IRRELEVANT' ],
  },
  url: {
    type: String,
    required: true
  },
  request: {
    type: Object,
    required: true
  },
  result: {
    type: Object
  },
  sendTriesCount: {
    type: Number
  },
  systemId: {
    type: Schema.Types.ObjectId, 
    ref: 'system',
    required: true
  },
  info: {
    type: String
  },
  action: {
    type: String,
    enum: [ 'createObject', 'changeStatusObject', 'sendAttach', 'createStp', 'updateStp', 'systemVerify' ]
  },
  ip: {
    type: String,
    required: function () {
        return this.type === 'Входящий';
    }
  }
}, {
  timestamps: true
});

restSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('rest', restSchema);
exports.scheme = restSchema;