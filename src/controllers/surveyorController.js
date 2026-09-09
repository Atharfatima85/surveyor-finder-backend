const axios = require('axios');
const Surveyor = require('../models/Surveyor');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DISTANCE_MATRIX_URL =
  'https://maps.googleapis.com/maps/api/distancematrix/json';
const DISTANCE_MATRIX_ORIGIN_LIMIT = 25;

const sampleSurveyors = [
  {
    name: 'James Harrington',
    phone: '020 7946 0011',
    address: '42 Whitechapel Road, London E1 1DU',
    latitude: 51.5155,
    longitude: -0.0628,
    areas: ['Whitechapel', 'Aldgate', 'Stepney', 'E1'],
    isAvailable: true,
  },
  {
    name: 'Priya Sharma',
    phone: '020 7946 0148',
    address: '18 Bethnal Green Road, London E2 6DG',
    latitude: 51.5274,
    longitude: -0.0554,
    areas: ['Bethnal Green', 'Shoreditch', 'E2'],
    isAvailable: true,
  },
  {
    name: 'Oliver Bennett',
    phone: '020 7946 0283',
    address: '7 Victoria Street, London SW1H 0NG',
    latitude: 51.4975,
    longitude: -0.1357,
    areas: ['Westminster', 'Victoria', 'Pimlico', 'SW1'],
    isAvailable: true,
  },
  {
    name: 'Sophie Clarke',
    phone: '020 7946 0339',
    address: '25 Camden High Street, London NW1 7JE',
    latitude: 51.539,
    longitude: -0.1426,
    areas: ['Camden', "Regent's Park", 'NW1'],
    isAvailable: true,
  },
  {
    name: 'Mohammed Ali',
    phone: '020 7946 0472',
    address: '12 Borough High Street, London SE1 9QQ',
    latitude: 51.5045,
    longitude: -0.091,
    areas: ['Southwark', 'London Bridge', 'Borough', 'SE1'],
    isAvailable: true,
  },
  {
    name: 'Emily Walsh',
    phone: '020 7946 0516',
    address: '88 Oxford Street, London W1D 1BS',
    latitude: 51.5154,
    longitude: -0.141,
    areas: ['West End', 'Soho', 'Mayfair', 'W1'],
    isAvailable: true,
  },
  {
    name: 'Daniel Okonkwo',
    phone: '020 7946 0621',
    address: '3 Upper Street, London N1 0PQ',
    latitude: 51.5335,
    longitude: -0.106,
    areas: ['Islington', 'Angel', 'N1'],
    isAvailable: true,
  },
  {
    name: 'Charlotte Reed',
    phone: '020 7946 0788',
    address: '21 Clerkenwell Road, London EC1M 5RS',
    latitude: 51.5225,
    longitude: -0.1025,
    areas: ['Clerkenwell', 'Farringdon', 'EC1'],
    isAvailable: true,
  },
  {
    name: 'Thomas Nguyen',
    phone: '020 7946 0844',
    address: '15 Great Russell Street, London WC1B 3DG',
    latitude: 51.5178,
    longitude: -0.127,
    areas: ['Bloomsbury', 'Holborn', 'WC1'],
    isAvailable: true,
  },
  {
    name: 'Aisha Khan',
    phone: '020 7946 0991',
    address: '1 Canada Square, London E14 5AB',
    latitude: 51.5054,
    longitude: -0.0235,
    areas: ['Canary Wharf', 'Isle of Dogs', 'Poplar', 'E14'],
    isAvailable: true,
  },
];

const getGoogleMapsKey = () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_GOOGLE_MAPS_KEY_HERE') {
    return null;
  }
  return key;
};

const chunk = (items, size) => {
  const groups = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
};

exports.createSurveyor = async (req, res) => {
  try {
    const { name, phone, address, latitude, longitude, areas } = req.body;

    const missing = [];
    if (!name) missing.push('name');
    if (!phone) missing.push('phone');
    if (!address) missing.push('address');
    if (latitude === undefined || latitude === null) missing.push('latitude');
    if (longitude === undefined || longitude === null) missing.push('longitude');
    if (areas === undefined || areas === null) missing.push('areas');

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    if (typeof latitude !== 'number' || Number.isNaN(latitude)) {
      return res.status(400).json({ message: 'latitude must be a number' });
    }

    if (typeof longitude !== 'number' || Number.isNaN(longitude)) {
      return res.status(400).json({ message: 'longitude must be a number' });
    }

    if (!Array.isArray(areas) || areas.some((area) => typeof area !== 'string')) {
      return res
        .status(400)
        .json({ message: 'areas must be an array of strings' });
    }

    const surveyor = await Surveyor.create({
      name,
      phone,
      address,
      latitude,
      longitude,
      areas,
      isAvailable: req.body.isAvailable,
    });

    res.status(201).json(surveyor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getSurveyors = async (req, res) => {
  try {
    const surveyors = await Surveyor.find();
    res.json(surveyors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.searchSurveyors = async (req, res) => {
  try {
    const address = req.query.address?.trim();
    if (!address) {
      return res
        .status(400)
        .json({ message: 'Query parameter "address" is required' });
    }

    const apiKey = getGoogleMapsKey();
    if (!apiKey) {
      return res.status(500).json({
        message: 'GOOGLE_MAPS_API_KEY is not configured',
      });
    }

    const geocodeResponse = await axios.get(GEOCODE_URL, {
      params: {
        address,
        key: apiKey,
      },
    });

    const geocodeData = geocodeResponse.data;
    if (geocodeData.status === 'ZERO_RESULTS' || !geocodeData.results?.length) {
      return res.status(404).json({
        message: `No location found for address: ${address}`,
      });
    }

    if (geocodeData.status !== 'OK') {
      return res.status(502).json({
        message: 'Google Geocoding API error',
        details: geocodeData.error_message || geocodeData.status,
      });
    }

    const { lat: destLat, lng: destLng } =
      geocodeData.results[0].geometry.location;

    const surveyors = await Surveyor.find();
    if (surveyors.length === 0) {
      return res.json([]);
    }

    const distanceElements = [];
    for (const group of chunk(surveyors, DISTANCE_MATRIX_ORIGIN_LIMIT)) {
      const origins = group
        .map((surveyor) => `${surveyor.latitude},${surveyor.longitude}`)
        .join('|');

      const matrixResponse = await axios.get(DISTANCE_MATRIX_URL, {
        params: {
          origins,
          destinations: `${destLat},${destLng}`,
          mode: 'driving',
          units: 'imperial',
          key: apiKey,
        },
      });

      const matrixData = matrixResponse.data;
      if (matrixData.status !== 'OK') {
        return res.status(502).json({
          message: 'Google Distance Matrix API error',
          details: matrixData.error_message || matrixData.status,
        });
      }

      const rows = matrixData.rows || [];
      for (let i = 0; i < group.length; i += 1) {
        distanceElements.push(rows[i]?.elements?.[0] || null);
      }
    }

    const results = surveyors
      .map((surveyor, index) => {
        const element = distanceElements[index];
        const isOk = element?.status === 'OK';

        return {
          _id: surveyor._id,
          name: surveyor.name,
          phone: surveyor.phone,
          address: surveyor.address,
          areas: surveyor.areas,
          isAvailable: surveyor.isAvailable,
          distanceText: isOk ? element.distance.text : null,
          distanceValue: isOk ? element.distance.value : Number.MAX_SAFE_INTEGER,
          durationText: isOk ? element.duration.text : null,
          durationValue: isOk ? element.duration.value : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.distanceValue - b.distanceValue);

    res.json(results);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        message: 'Google Maps API request failed',
        details: error.response.data,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.seedSurveyors = async (req, res) => {
  try {
    const existingCount = await Surveyor.countDocuments();
    if (existingCount > 0) {
      return res.json({
        insertedCount: 0,
        message: 'Collection already has surveyors',
      });
    }

    const inserted = await Surveyor.insertMany(sampleSurveyors);
    res.status(201).json({ insertedCount: inserted.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSurveyorById = async (req, res) => {
  try {
    const surveyor = await Surveyor.findById(req.params.id);
    if (!surveyor) {
      return res.status(404).json({ message: 'Surveyor not found' });
    }
    res.json(surveyor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSurveyor = async (req, res) => {
  try {
    const surveyor = await Surveyor.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!surveyor) {
      return res.status(404).json({ message: 'Surveyor not found' });
    }
    res.json(surveyor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteSurveyor = async (req, res) => {
  try {
    const surveyor = await Surveyor.findByIdAndDelete(req.params.id);
    if (!surveyor) {
      return res.status(404).json({ message: 'Surveyor not found' });
    }
    res.json({ message: 'Surveyor deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
