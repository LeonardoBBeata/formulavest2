const LESSON_IDS = new Set([
  'tese-argumentos',
  'conectivos-coesao',
  'porcentagem',
  'funcao-primeiro-grau',
  'revolucao-industrial',
  'abolicao-pos-abolicao',
  'escala-cartografica',
  'urbanizacao-rede-urbana',
  'simple-present',
  'false-friends'
]);
const ACTIVITY_KINDS = new Set(['exam', 'essay', 'focus', 'manual', 'task']);
const GOAL_KINDS = new Set(['exam', 'essay', 'manual']);

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeItems(items, kind) {
  if (!Array.isArray(items) || items.length > 50) return null;
  const normalized = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const text = String(item.texto || '').trim();
    if (!text || text.length > (kind === 'plan' ? 120 : 100) || typeof item.feito !== 'boolean') return null;

    if (kind === 'plan') {
      normalized.push({ texto: text, feito: item.feito });
      continue;
    }

    const goalKind = String(item.kind || 'manual');
    if (!GOAL_KINDS.has(goalKind)) return null;
    normalized.push({ texto: text, feito: item.feito, kind: goalKind });
  }

  return normalized;
}

function normalizeStudyProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const activities = value.activities;
  if (!Array.isArray(activities) || activities.length > 5000) return null;
  const normalizedActivities = [];

  for (const activity of activities) {
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return null;
    const minutes = Number(activity.minutes);
    if (
      !isDateKey(activity.date) ||
      !ACTIVITY_KINDS.has(activity.kind) ||
      !Number.isInteger(minutes) ||
      minutes < 0 ||
      minutes > 1440 ||
      (activity.id !== undefined && (typeof activity.id !== 'string' || activity.id.length > 80))
    ) return null;

    normalizedActivities.push({
      ...(activity.id ? { id: activity.id } : {}),
      date: activity.date,
      kind: activity.kind,
      minutes
    });
  }

  if (!isDateKey(value.planDate) || !isDateKey(value.goalsDate)) return null;
  const plan = normalizeItems(value.plan, 'plan');
  const goals = normalizeItems(value.goals, 'goals');
  if (!plan || !goals) return null;

  const lessons = value.lessons;
  if (!lessons || typeof lessons !== 'object' || Array.isArray(lessons)) return null;
  const normalizedLessons = {};
  for (const [lessonId, lesson] of Object.entries(lessons)) {
    if (!LESSON_IDS.has(lessonId) || !lesson || typeof lesson !== 'object' || Array.isArray(lesson)) return null;
    const score = Number(lesson.score);
    const total = Number(lesson.total);
    const completedAt = String(lesson.completedAt || '');
    if (
      !Number.isInteger(score) ||
      !Number.isInteger(total) ||
      score < 0 ||
      total < 1 ||
      score > total ||
      total > 10 ||
      Number.isNaN(Date.parse(completedAt))
    ) return null;
    normalizedLessons[lessonId] = { score, total, completedAt };
  }

  return {
    activities: normalizedActivities,
    planDate: value.planDate,
    plan,
    goalsDate: value.goalsDate,
    goals,
    lessons: normalizedLessons
  };
}

module.exports = { normalizeStudyProgress };
