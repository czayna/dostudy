'use strict';
/* Confidence-based spaced repetition (Brainscape style), rating 1-5.
   1 = total blank -> back in 2 minutes
   2 = fuzzy       -> later today (8 hours)
   3 = took effort -> tomorrow
   4 = got it      -> 3 days
   5 = mastered    -> 7 days (and grows each time you keep nailing it) */
const BASE_MINUTES = { 1: 2, 2: 8 * 60, 3: 24 * 60, 4: 3 * 24 * 60, 5: 7 * 24 * 60 };

function nextReview(rating, reps, now = new Date()) {
  const r = Math.min(5, Math.max(1, Math.round(Number(rating)) || 1));
  const newReps = r >= 3 ? reps + 1 : 0;
  const growth = r >= 4 ? 1 + 0.5 * Math.max(0, newReps - 1) : 1;
  const minutes = Math.round(BASE_MINUTES[r] * growth);
  return { reps: newReps, dueAt: new Date(now.getTime() + minutes * 60000), minutes };
}

// SQLite-friendly UTC timestamp: "YYYY-MM-DD HH:MM:SS"
const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

module.exports = { nextReview, toSql };
