const axios = require('axios');
const Surveyor = require('../models/Surveyor');
const realSurveyors = require('../seeds/realSurveyors');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'http://router.project-osrm.org/route/v1/driving';
const METERS_PER_MILE = 1609.34;

const formatDistanceText = (meters) => {
  const miles = Math.round((meters / METERS_PER_MILE) * 10) / 10;
  return `${miles} miles`;
};

const formatDurationText = (seconds) => {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} mins`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hrs ${minutes} mins`;
};

const getRouteForSurveyor = async (surveyor, destLng, destLat) => {
  const url = `${OSRM_URL}/${surveyor.longitude},${surveyor.latitude};${destLng},${destLat}`;
  const { data } = await axios.get(url, {
    params: { overview: 'false' },
  });

  if (data.code !== 'Ok' || !data.routes?.length) {
    return null;
  }

  return data.routes[0];
};

const geocodeAddress = async (address) => {
  const { data } = await axios.get(NOMINATIM_URL, {
    params: {
      q: address,
      format: 'json',
      limit: 1,
    },
    headers: {
      'User-Agent': 'SurveyorFinder/1.0',
    },
  });

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
};

const resolveCoordinates = async ({ address, latitude, longitude }) => {
  const hasCoords =
    latitude !== undefined &&
    latitude !== null &&
    latitude !== '' &&
    longitude !== undefined &&
    longitude !== null &&
    longitude !== '';
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (hasCoords && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { latitude: lat, longitude: lng };
  }

  const location = await geocodeAddress(address);
  if (!location) {
    return null;
  }

  return { latitude: location.lat, longitude: location.lng };
};

exports.geocodeSurveyor = async (req, res) => {
  try {
    const address = req.query.address?.trim();
    if (!address) {
      return res
        .status(400)
        .json({ message: 'Query parameter "address" is required' });
    }

    const location = await geocodeAddress(address);
    if (!location) {
      return res.status(404).json({
        message: `No location found for address: ${address}`,
      });
    }

    res.json(location);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        message: 'Geocoding request failed',
        details: error.response.data,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.createSurveyor = async (req, res) => {
  try {
    const { name, phone, address, latitude, longitude, areas } = req.body;

    const missing = [];
    if (!name) missing.push('name');
    if (!phone) missing.push('phone');
    if (!address) missing.push('address');

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    const resolvedAreas = Array.isArray(areas) ? areas : [];
    if (resolvedAreas.some((area) => typeof area !== 'string')) {
      return res
        .status(400)
        .json({ message: 'areas must be an array of strings' });
    }

    const coords = await resolveCoordinates({ address, latitude, longitude });
    if (!coords) {
      return res.status(400).json({
        message: 'Could not find location for that address',
      });
    }

    const surveyor = await Surveyor.create({
      name,
      phone,
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      areas: resolvedAreas,
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

    const location = await geocodeAddress(address);
    if (!location) {
      return res.status(404).json({
        message: `No location found for address: ${address}`,
      });
    }

    const destLat = location.lat;
    const destLng = location.lng;

    const surveyors = await Surveyor.find();
    if (surveyors.length === 0) {
      return res.json([]);
    }

    const routes = await Promise.all(
      surveyors.map(async (surveyor) => {
        try {
          return await getRouteForSurveyor(surveyor, destLng, destLat);
        } catch (error) {
          return null;
        }
      })
    );

    const results = surveyors
      .map((surveyor, index) => {
        const route = routes[index];
        const isOk = Boolean(route);

        return {
          _id: surveyor._id,
          name: surveyor.name,
          phone: surveyor.phone,
          address: surveyor.address,
          areas: surveyor.areas,
          isAvailable: surveyor.isAvailable,
          distanceText: isOk ? formatDistanceText(route.distance) : null,
          distanceValue: isOk ? route.distance : Number.MAX_SAFE_INTEGER,
          durationText: isOk ? formatDurationText(route.duration) : null,
          durationValue: isOk ? route.duration : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.distanceValue - b.distanceValue);

    res.json(results);
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        message: 'Geocoding or routing request failed',
        details: error.response.data,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.seedSurveyors = async (req, res) => {
  try {
    await Surveyor.deleteMany({});
    const inserted = await Surveyor.insertMany(realSurveyors);
    res.status(201).json({
      message: '16 surveyors seeded',
      count: inserted.length,
    });
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
    const existing = await Surveyor.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Surveyor not found' });
    }

    const updates = { ...req.body };
    const nextAddress = updates.address ?? existing.address;
    const addressChanged =
      typeof updates.address === 'string' &&
      updates.address.trim() !== existing.address;
    const coords = await resolveCoordinates({
      address: nextAddress,
      latitude:
        updates.latitude != null
          ? updates.latitude
          : addressChanged
            ? undefined
            : existing.latitude,
      longitude:
        updates.longitude != null
          ? updates.longitude
          : addressChanged
            ? undefined
            : existing.longitude,
    });

    if (!coords) {
      return res.status(400).json({
        message: 'Could not find location for that address',
      });
    }

    updates.latitude = coords.latitude;
    updates.longitude = coords.longitude;

    if (updates.areas != null && !Array.isArray(updates.areas)) {
      return res
        .status(400)
        .json({ message: 'areas must be an array of strings' });
    }

    const surveyor = await Surveyor.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
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
