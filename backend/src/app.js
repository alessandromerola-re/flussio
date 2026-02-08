import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import categoriesRoutes from './routes/categories.js';
import contactsRoutes from './routes/contacts.js';
import propertiesRoutes from './routes/properties.js';
import transactionsRoutes from './routes/transactions.js';
import attachmentsRoutes from './routes/attachments.js';
import dashboardRoutes from './routes/dashboard.js';
import { authMiddleware } from './middleware/auth.js';

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

app.use('/api/accounts', authMiddleware, accountsRoutes);
app.use('/api/categories', authMiddleware, categoriesRoutes);
app.use('/api/contacts', authMiddleware, contactsRoutes);
app.use('/api/properties', authMiddleware, propertiesRoutes);
app.use('/api/transactions', authMiddleware, transactionsRoutes);
app.use('/api/attachments', authMiddleware, attachmentsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ error_code: 'NOT_FOUND' });
});

export default app;
