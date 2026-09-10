require('dotenv').config();

const mongoose = require('mongoose');
const app = require('../src/app');

let connecting;

async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  if (!connecting) {
    connecting = mongoose.connect(process.env.MONGODB_URI);
  }
  await connecting;
}

module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
