import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_CREDENTIALS' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const user = result.rows[0];
    if (user.is_active === false) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    let companies = [];
    if (user.is_super_admin === true) {
      const companiesResult = await query(
        'SELECT id, name FROM companies ORDER BY name'
      );
      companies = companiesResult.rows.map((company) => ({
        id: company.id,
        name: company.name,
        role: 'super_admin',
      }));
    } else {
      try {
        const companiesResult = await query(
          `SELECT c.id, c.name, uc.role
           FROM user_companies uc
           JOIN companies c ON c.id = uc.company_id
           WHERE uc.user_id = $1
             AND uc.is_active = true
           ORDER BY c.name`,
          [user.id]
        );
        companies = companiesResult.rows.map((company) => ({
          id: company.id,
          name: company.name,
          role: company.role,
        }));

        if (companies.length === 0 && user.company_id) {
          const fallbackCompanyResult = await query(
            'SELECT id, name FROM companies WHERE id = $1',
            [user.company_id]
          );
          if (fallbackCompanyResult.rowCount > 0) {
            const fallbackRole = user.role || 'admin';
            companies = [{
              id: fallbackCompanyResult.rows[0].id,
              name: fallbackCompanyResult.rows[0].name,
              role: fallbackRole,
            }];

            await query(
              `INSERT INTO user_companies (user_id, company_id, role, is_active)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (user_id, company_id) DO NOTHING`,
              [user.id, user.company_id, fallbackRole]
            );
          }
        }
      } catch (membershipError) {
        if (membershipError?.code !== '42P01') {
          throw membershipError;
        }

        const fallbackCompanyResult = await query(
          'SELECT id, name FROM companies WHERE id = $1',
          [user.company_id]
        );
        companies = fallbackCompanyResult.rows.map((company) => ({
          id: company.id,
          name: company.name,
          role: user.role || 'admin',
        }));
      }
    }

    if (companies.length === 0) {
      return res.status(403).json({ error_code: 'AUTH_NO_COMPANY_ACCESS' });
    }

    const defaultCompany =
      companies.find((company) => company.id === user.company_id) || companies[0];
    const default_company_id = defaultCompany.id;
    const default_company_role = defaultCompany.role;

    const token = jwt.sign(
      {
        user_id: user.id,
        email: user.email,
        is_super_admin: user.is_super_admin === true,
        default_company_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      default_company_id,
      companies,
      role: default_company_role,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
