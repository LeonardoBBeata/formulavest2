const studyTracker = (() => {
  const SESSION_TYPES = new Set(['exam', 'essay', 'focus', 'manual']);
  const ACTIVITY_TYPES = new Set([...SESSION_TYPES, 'task']);

  function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function shiftDateKey(value, amount) {
    const date = parseDateKey(value);
    if (!date) return null;
    date.setDate(date.getDate() + amount);
    return dateKey(date);
  }

  function weekDays(value = new Date()) {
    const today = dateKey(value);
    const date = parseDateKey(today);
    const offsetFromMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offsetFromMonday);

    return Array.from({ length: 7 }, () => {
      const key = dateKey(date);
      const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
        .format(date)
        .replace(/\.$/, '');
      date.setDate(date.getDate() + 1);
      return { date: key, label };
    });
  }

  function summarize(activities, value = new Date()) {
    const today = dateKey(value);
    const days = weekDays(value);
    const weekDates = new Set(days.map(day => day.date));
    const validActivities = (Array.isArray(activities) ? activities : [])
      .filter(activity => activity && typeof activity === 'object' && parseDateKey(activity.date))
      .map(activity => ({
        date: activity.date,
        kind: String(activity.kind || ''),
        minutes: Math.max(0, Math.min(1440, Number(activity.minutes) || 0))
      }))
      .filter(activity => ACTIVITY_TYPES.has(activity.kind));
    const activeDates = new Set(validActivities.map(activity => activity.date));
    const countSessions = items => items.filter(activity => SESSION_TYPES.has(activity.kind)).length;
    const sumMinutes = items => items.reduce((total, activity) => total + activity.minutes, 0);
    const todayActivities = validActivities.filter(activity => activity.date === today);
    const weeklyActivities = validActivities.filter(activity => weekDates.has(activity.date));

    let streak = 0;
    let streakDate = activeDates.has(today) ? today : shiftDateKey(today, -1);
    while (streakDate && activeDates.has(streakDate)) {
      streak += 1;
      streakDate = shiftDateKey(streakDate, -1);
    }

    const weeklyDays = days.map(day => {
      const dayActivities = weeklyActivities.filter(activity => activity.date === day.date);
      return {
        ...day,
        active: dayActivities.length > 0,
        sessions: countSessions(dayActivities),
        minutes: sumMinutes(dayActivities)
      };
    });

    return {
      streak,
      today: {
        activities: todayActivities.length,
        sessions: countSessions(todayActivities),
        minutes: sumMinutes(todayActivities)
      },
      week: {
        sessions: countSessions(weeklyActivities),
        activeDays: weeklyDays.filter(day => day.active).length,
        minutes: sumMinutes(weeklyActivities),
        days: weeklyDays
      }
    };
  }

  return { dateKey, parseDateKey, shiftDateKey, weekDays, summarize };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = studyTracker;
if (typeof window !== 'undefined') window.StudyTracker = studyTracker;
