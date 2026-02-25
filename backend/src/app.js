import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import categoriesRoutes from './routes/categories.js';
import contactsRoutes from './routes/contacts.js';
import propertiesRoutes from './routes/properties.js';
import jobsRoutes from './routes/jobs.js';
import transactionsRoutes from './routes/transactions.js';
import attachmentsRoutes from './routes/attachments.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import advancedReportsRoutes from './routes/advancedReports.js';
import recurringTemplatesRoutes from './routes/recurringTemplates.js';
import usersRoutes from './routes/users.js';
import scaffoldingRoutes from './routes/scaffolding.js';
import settingsRoutes from './routes/settings.js';
import { authMiddleware } from './middleware/auth.js';
import { companyContextMiddleware } from './middleware/companyContext.js';
import { requireMethodPermission } from './middleware/permissions.js';

dotenv.config();

const app = express();

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : '*';

app.use(
  cors({
    origin: corsOrigins,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'Flussio API', status: 'ok' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.use('/api/accounts', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), accountsRoutes);
app.use('/api/categories', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), categoriesRoutes);
app.use('/api/contacts', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), contactsRoutes);
app.use('/api/properties', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), propertiesRoutes);
app.use('/api/jobs', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), jobsRoutes);
app.use('/api/transactions', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), transactionsRoutes);
app.use('/api/attachments', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', DELETE: 'delete_sensitive' }), attachmentsRoutes);
app.use('/api/dashboard', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'read' }), dashboardRoutes);
app.use('/api/reports', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read' }), reportsRoutes);
app.use('/api/reports/advanced', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'read' }), advancedReportsRoutes);
app.use('/api/recurring-templates', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read', POST: 'write', PUT: 'write', DELETE: 'delete_sensitive' }), recurringTemplatesRoutes);
app.use('/api/users', authMiddleware, companyContextMiddleware, usersRoutes);
app.use('/api/scaffolding', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read' }), scaffoldingRoutes);
app.use('/api/settings', authMiddleware, companyContextMiddleware, requireMethodPermission({ GET: 'read' }), settingsRoutes);

app.use((req, res) => {
  res.status(404).json({ error_code: 'NOT_FOUND' });
});

export default app;
