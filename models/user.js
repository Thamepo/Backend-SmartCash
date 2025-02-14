// models/user.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  ShopCode: {
    type: String,
    required: false
  },
  ShopName: {
    type: String,
    required: false
  },
  employees: [{
    type: String,
    required: false
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('users', UserSchema);