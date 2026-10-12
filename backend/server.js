'use strict';
const express = require('express');
const config = require('./src/config');
require('./src/db'); // creates the database and applies database/schema.sql
const { errorHandler } = require('./src/routes/helpers');

const app = express();
app.disable('x-powered-by');

const allowedHosts = new Set([`localhost:${config.PORT}`, `127.0.0.1:${config.PORT}`]);
const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));

// Security: only answer to our own address (blocks DNS-rebinding) and reject cross-site writes (CSRF).
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host)) return res.status(403).send('Forbidden');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
    return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  });
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/api', require('./src/routes/system'));
app.use('/api', require('./src/routes/subjects'));
app.use('/api', require('./src/routes/study'));
app.use('/api', require('./src/routes/schedule'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(config.FRONTEND_DIR, { extensions: ['html'] }));
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.PORT, config.HOST, () => {
    console.log(`\n  🌸 DOSTUDY is running → http://localhost:${config.PORT}`);
    console.log(config.GEMINI_API_KEY ? `  ✓ Gemini ready (${config.GEMINI_MODEL})` : '  ⚠ No GEMINI_API_KEY in .env yet. AI features will ask you to add it.');
  });
}

module.exports = app;
