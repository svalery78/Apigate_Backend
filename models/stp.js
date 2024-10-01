const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const stpSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  SystemID: {
    type: Schema.Types.ObjectId, 
    ref: 'system',
    required: true
  },
  WSUrlPath: {
    type: String,
    //required: false
  },
  blocking: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

stpSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('stp', stpSchema);
exports.scheme = stpSchema;
