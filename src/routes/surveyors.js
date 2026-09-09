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
} = require('../controllers/surveyorController');

router.get('/', getSurveyors);
router.get('/search', searchSurveyors);
router.post('/seed', seedSurveyors);
router.post('/', createSurveyor);
router.get('/:id', getSurveyorById);
router.put('/:id', updateSurveyor);
router.delete('/:id', deleteSurveyor);

module.exports = router;
