const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const settingSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

settingSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('setting', settingSchema);
exports.scheme = settingSchema;
