const express = require('express');
const ordensController = require('../controllers/ordensController');
const telemetriaController = require('../controllers/telemetriaController');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

router.get('/ordens', ordensController.getOrdens);
router.post('/ordens', ordensController.postOrdem);
router.patch('/ordens/:id/status', ordensController.patchStatusOrdem);
router.post('/telemetria', telemetriaController.postTelemetria);

module.exports = router;
