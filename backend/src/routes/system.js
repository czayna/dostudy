'use strict';
const express = require('express');
const config = require('../config');
const { getSetting, setSetting } = require('../db');
const google = require('../services/google');
const { wrap, num } = require('./helpers');

const router = express.Router();

router.get('/health', wrap((req, res) => {
  res.json({ ok: true, ai: { configured: Boolean(config.GEMINI_API_KEY), model: config.GEMINI_MODEL }, google: google.status() });
}));

router.get('/settings', wrap((req, res) => res.json({ goal: getSetting('goal', 1.35) })));
router.put('/settings', wrap((req, res) => {
  if (req.body?.goal !== undefined) setSetting('goal', num(req.body.goal, { min: 1, max: 3, fallback: 1.35 }));
  res.json({ goal: getSetting('goal', 1.35) });
}));

/* Google Classroom: read-only. See services/google.js for the safety notes. */
router.get('/google/connect', wrap((req, res) => res.redirect(google.authUrl())));

router.get('/google/callback', wrap(async (req, res) => {
  try {
    if (req.query.error) throw new Error('Sign-in was cancelled.');
    await google.handleCallback(String(req.query.code || ''), String(req.query.state || ''));
    res.redirect('/#/schedule?google=connected');
  } catch (e) {
    res.redirect(`/#/schedule?google_error=${encodeURIComponent(e.message)}`);
  }
}));

router.post('/google/sync', wrap(async (req, res) => res.json(await google.sync())));
router.post('/google/disconnect', wrap((req, res) => { google.disconnect(); res.json({ ok: true }); }));

module.exports = router;
