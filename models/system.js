const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const systemSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    //enum: [ 'sm', 'json' ],
    //required: true
  },
  UserId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  ResponsibleFIO: {
    type: String,
    required: true
  },
  ResponsibleEmail: {
    type: String,
    required: true
  },
  ResponsiblePhone: {
    type: String,
    required: true
  },
  WSUrlBase: { //Указывается baseUrl, а не полный URL.
    type: String,
    required: true
  },
  WSUrlAttach: {
    type: String
  },
  WSLogin: {
    type: String,
    //required: true
  },
  WSPassword: {
    type: String,
    //required: true
  },
  WSHeader: {
    type: Object
    //required: true
  },
  StpWSUrlPath: {
    type: String,
    //required: true
  },
  DataStructure: {
    type: String,
    enum: ['','4me (json)']
  },
  AuthType: {
    type: String,
    enum: ['Basic', 'No auth']
  }
}, {
  timestamps: true
});

systemSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('system', systemSchema);
exports.scheme = systemSchema;
