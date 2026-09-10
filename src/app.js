const express = require('express');
const cors = require('cors');
const surveyorRoutes = require('./routes/surveyors');

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((origin) => origin.trim())
  : true;

app.use(
  cors({
    origin: allowedOrigins,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/surveyors', surveyorRoutes);

module.exports = app;
