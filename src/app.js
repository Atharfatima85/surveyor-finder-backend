const express = require('express');
const cors = require('cors');
const surveyorRoutes = require('./routes/surveyors');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
  })
);
app.use(express.json());
app.use('/api/surveyors', surveyorRoutes);

module.exports = app;
