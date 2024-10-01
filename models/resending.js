const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const resendingSchema = new Schema({
  systemId: {
    type: Schema.Types.ObjectId, 
    ref: 'system',
    required: false // убрали, тк Наташа в 77017 сказала, что для системы по умолчанию должно быть пусто
  },
  systemName: {
    type: String,
    required: false,
  },
  countTotal: {
    type: Number,
    required: true
  },
  settings: {
    type: Array,
    required: true
  }
}, {
  timestamps: true
});

resendingSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('resending', resendingSchema);
exports.scheme = resendingSchema;
