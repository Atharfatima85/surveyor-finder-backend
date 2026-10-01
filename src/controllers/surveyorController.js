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

const POSTCODES_IO_URL = 'https://api.postcodes.io';

const extractPostcode = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i);
  return match ? match[1].toUpperCase().replace(/\s+/, ' ') : null;
};

const extractOutcode = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.trim().match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)$/i);
  return match ? match[1].toUpperCase() : null;
};

const geocodePostcode = async (postcodeStr) => {
  try {
    const clean = postcodeStr.replace(/\s+/g, '');
    const { data } = await axios.get(
      `${POSTCODES_IO_URL}/postcodes/${encodeURIComponent(clean)}`,
      { timeout: 5000 }
    );
    if (data.status === 200 && data.result) {
      return {
        lat: data.result.latitude,
        lng: data.result.longitude,
        postcode: data.result.postcode,
      };
    }
  } catch (err) {
    try {
      const cleanOut = postcodeStr.trim().toUpperCase();
      const { data } = await axios.get(
        `${POSTCODES_IO_URL}/outcodes/${encodeURIComponent(cleanOut)}`,
        { timeout: 5000 }
      );
      if (data.status === 200 && data.result) {
        return {
          lat: data.result.latitude,
          lng: data.result.longitude,
          postcode: data.result.outcode,
        };
      }
    } catch (err2) {
      return null;
    }
  }
  return null;
};

const geocodeAddress = async (address) => {
  const trimmed = address.trim();

  // 1. Check if query is or contains a UK postcode or outcode
  const fullPcMatch = extractPostcode(trimmed);
  const outcodeMatch = extractOutcode(trimmed);

  if (fullPcMatch) {
    const pcResult = await geocodePostcode(fullPcMatch);
    if (pcResult) return pcResult;
  } else if (outcodeMatch) {
    const outResult = await geocodePostcode(outcodeMatch);
    if (outResult) return outResult;
  }

  // 2. Fallback to OpenStreetMap Nominatim with UK priority
  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        countrycodes: 'gb',
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'SurveyorFinder/1.0',
      },
      timeout: 6000,
    });

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    const foundPostcode =
      data[0].address?.postcode ||
      extractPostcode(data[0].display_name) ||
      fullPcMatch ||
      null;

    return { lat, lng, postcode: foundPostcode };
  } catch (error) {
    return null;
  }
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
    return {
      latitude: lat,
      longitude: lng,
      postcode: extractPostcode(address) || '',
    };
  }

  const location = await geocodeAddress(address);
  if (!location) {
    return null;
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
    postcode: location.postcode || extractPostcode(address) || '',
  };
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

    const resolvedDays = Array.isArray(req.body.availableDays)
      ? req.body.availableDays
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const resolvedSlots = Array.isArray(req.body.timeSlots)
      ? req.body.timeSlots
      : ['Morning', 'Evening'];

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
      postcode: req.body.postcode || coords.postcode || extractPostcode(address) || '',
      areas: resolvedAreas,
      availableDays: resolvedDays,
      timeSlots: resolvedSlots,
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

    const day = req.query.day?.trim();
    const timeSlot = req.query.timeSlot?.trim();

    const location = await geocodeAddress(address);
    if (!location) {
      return res.status(404).json({
        message: `No location found for address: ${address}`,
      });
    }

    const destLat = location.lat;
    const destLng = location.lng;
    const searchPostcode =
      location.postcode ||
      extractPostcode(address) ||
      extractOutcode(address) ||
      address.trim().toUpperCase();

    let surveyors = await Surveyor.find();

    if (day && day !== 'all') {
      surveyors = surveyors.filter((s) =>
        Array.isArray(s.availableDays) && s.availableDays.includes(day)
      );
    }

    if (timeSlot && timeSlot !== 'all') {
      surveyors = surveyors.filter((s) =>
        Array.isArray(s.timeSlots) && s.timeSlots.includes(timeSlot)
      );
    }

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
        const surveyorPostcode =
          surveyor.postcode || extractPostcode(surveyor.address) || '';

        return {
          _id: surveyor._id,
          name: surveyor.name,
          phone: surveyor.phone,
          address: surveyor.address,
          postcode: surveyorPostcode,
          searchPostcode: searchPostcode,
          areas: surveyor.areas,
          isAvailable: surveyor.isAvailable,
          availableDays: surveyor.availableDays || [],
          timeSlots: surveyor.timeSlots || [],
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
    if (coords.postcode) {
      updates.postcode = coords.postcode;
    } else if (updates.address) {
      updates.postcode = extractPostcode(updates.address) || '';
    }

    if (updates.areas != null && !Array.isArray(updates.areas)) {
      return res
        .status(400)
        .json({ message: 'areas must be an array of strings' });
    }

    if (updates.availableDays != null && !Array.isArray(updates.availableDays)) {
      return res
        .status(400)
        .json({ message: 'availableDays must be an array of strings' });
    }

    if (updates.timeSlots != null && !Array.isArray(updates.timeSlots)) {
      return res
        .status(400)
        .json({ message: 'timeSlots must be an array of strings' });
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
