require('dotenv').config();

const mongoose = require('mongoose');
const app = require('../src/app');

let connecting;

async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!connecting) {
    connecting = mongoose
      .connect(process.env.MONGODB_URI)
      .catch((error) => {
        connecting = undefined;
        throw error;
      });
  }

  await connecting;
}

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(
      JSON.stringify({
        message: 'MongoDB connection failed',
        details: error.message,
      })
    );
    return;
  }

  return app(req, res);
};
