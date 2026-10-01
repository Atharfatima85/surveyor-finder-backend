const mongoose = require('mongoose');

const surveyorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  postcode: {
    type: String,
    default: '',
  },
  areas: {
    type: [String],
    default: [],
  },
  availableDays: {
    type: [String],
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },
  timeSlots: {
    type: [String],
    default: ['Morning', 'Evening'],
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Surveyor', surveyorSchema);
