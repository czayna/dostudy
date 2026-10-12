/* GWA math. Percent -> Philippine grade (1.00 best ... 5.00 fail). Edit the table if your school differs. */
export const GRADE_TABLE = [
  { min: 97, grade: 1.0 }, { min: 94, grade: 1.25 }, { min: 91, grade: 1.5 }, { min: 88, grade: 1.75 },
  { min: 85, grade: 2.0 }, { min: 82, grade: 2.25 }, { min: 79, grade: 2.5 }, { min: 76, grade: 2.75 },
  { min: 75, grade: 3.0 }, { min: 0, grade: 5.0 },
];

export const percentToGrade = (p) => GRADE_TABLE.find((r) => p >= r.min).grade;

/** Lowest percent that still reaches the goal grade. For 1.35 this is 94% (a 1.25). */
export function targetPercent(goal) {
  const ok = GRADE_TABLE.filter((r) => r.grade <= goal);
  return ok.length ? Math.min(...ok.map((r) => r.min)) : 97;
}

export function analyze(subject, goal) {
  const comps = subject.components;
  const totalWeight = comps.reduce((a, c) => a + (+c.weight || 0), 0);
  const done = comps.filter((c) => c.score !== null && c.score !== '' && !Number.isNaN(Number(c.score)));
  const doneWeight = done.reduce((a, c) => a + (+c.weight || 0), 0);
  const earned = done.reduce((a, c) => a + (+c.score) * (+c.weight) / 100, 0);
  const remainingWeight = totalWeight - doneWeight;
  const target = targetPercent(goal);
  return {
    totalWeight, doneWeight, earned, remainingWeight, target,
    standing: doneWeight > 0 ? (earned / doneWeight) * 100 : null,
    needed: remainingWeight > 0 ? ((target - earned) / remainingWeight) * 100 : null,
  };
}

export function overallGwa(subjects, goal) {
  let units = 0, sum = 0;
  subjects.forEach((s) => {
    const a = analyze(s, goal);
    if (a.standing === null) return;
    units += +s.units || 0; sum += percentToGrade(a.standing) * (+s.units || 0);
  });
  return units ? sum / units : null;
}

export function statusFor(a) {
  if (a.standing === null) return { cls: '', text: 'No grades yet' };
  if (a.remainingWeight <= 0) return a.earned >= a.target ? { cls: 'good', text: 'Goal reached ✓' } : { cls: 'bad', text: 'Below goal' };
  if (a.needed > 100) return { cls: 'bad', text: 'Needs rescue plan' };
  if (a.needed > 92) return { cls: 'warn', text: 'Tight, stay sharp' };
  return { cls: 'good', text: 'On track' };
}
