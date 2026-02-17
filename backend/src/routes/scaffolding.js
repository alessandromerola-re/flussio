import express from 'express';
import { requirePermission } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';

const router = express.Router();

router.get('/roadmap', requirePermission('users_manage'), async (req, res) => {
  const showRoadmap = String(process.env.SHOW_ROADMAP || 'false').toLowerCase() === 'true';
  if (!showRoadmap) {
    return sendError(res, 404, 'NOT_FOUND', 'Roadmap non disponibile.');
  }
  return res.json({
    users: {
      registration: 'feature-flagged',
      management: 'basic-admin-api-ready',
      reset_password: 'token-flow-scaffolded',
    },
    properties: {
      extended_sheet: 'coming-soon',
      photos: 'coming-soon',
      geolocation: 'coming-soon',
    },
    contracts: {
      schema: 'scaffolded',
      schedule: 'coming-soon',
    },
    reports: {
      advanced_reports: 'coming-soon',
      csv_import: 'coming-soon',
      backup_restore: 'coming-soon',
    },
  });
});

export default router;
