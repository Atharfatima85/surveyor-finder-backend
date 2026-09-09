const express = require('express');
const router = express.Router();
const {
  getSurveyors,
  getSurveyorById,
  createSurveyor,
  updateSurveyor,
  deleteSurveyor,
  searchSurveyors,
  seedSurveyors,
  geocodeSurveyor,
} = require('../controllers/surveyorController');

router.get('/', getSurveyors);
router.get('/search', searchSurveyors);
router.get('/geocode', geocodeSurveyor);
router.post('/seed', seedSurveyors);
router.post('/', createSurveyor);
router.get('/:id', getSurveyorById);
router.put('/:id', updateSurveyor);
router.delete('/:id', deleteSurveyor);

module.exports = router;
