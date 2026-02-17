import express from 'express';

const router = express.Router();

router.get('/roadmap', async (req, res) => {
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
