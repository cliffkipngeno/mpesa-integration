const mongoose = require('mongoose');
const transactionSchema = new mongoose.Schema({
  phoneNumber: String,
  amount: Number,
  reference: String,
  transactionId: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Transaction', transactionSchema);