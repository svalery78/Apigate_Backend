const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    login: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true
    },
    authType: {
        type: String,
        enum: ['Basic', 'WhiteList']
    },
    whiteList: {
        type: Object
    }
}, {
    timestamps: true
});

userSchema.plugin(mongoosePaginate);

exports.model = mongoose.model('user', userSchema);
exports.scheme = userSchema;