const fs = require('fs');
const path = require('path');
const vm = require('vm');
const StudyTracker = require('../public/study-tracker');

describe('resumo de atividade de estudo', () => {
  test('pode ser carregado no mesmo escopo de navegador que o script principal', () => {
    const scripts = ['study-tracker.js', 'script.js']
      .map(file => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'))
      .join('\n');

    expect(() => new vm.Script(scripts)).not.toThrow();
  });

  test('calcula sequência por dias distintos e mantém a sequência até o fim do dia seguinte', () => {
    const today = new Date(2026, 10, 22, 12);
    const activityDates = [
      StudyTracker.shiftDateKey(StudyTracker.dateKey(today), -1),
      StudyTracker.dateKey(today)
    ];
    const activities = activityDates.map(date => ({ date, kind: 'focus', minutes: 25 }));

    expect(StudyTracker.summarize(activities, today).streak).toBe(2);
    expect(StudyTracker.summarize(activities, new Date(2026, 10, 23, 12)).streak).toBe(2);
    expect(StudyTracker.summarize(activities, new Date(2026, 10, 24, 12)).streak).toBe(0);
  });

  test('resume sessões, dias ativos e minutos somente na semana atual', () => {
    const today = new Date(2026, 10, 22, 12);
    const activities = [
      { date: '2026-11-16', kind: 'manual', minutes: 25 },
      { date: '2026-11-20', kind: 'focus', minutes: 25 },
      { date: '2026-11-21', kind: 'task', minutes: 0 },
      { date: '2026-11-22', kind: 'exam', minutes: 0 },
      { date: '2026-11-15', kind: 'focus', minutes: 25 },
      { date: '2026-11-22', kind: 'invalid', minutes: 9000 }
    ];

    expect(StudyTracker.summarize(activities, today)).toMatchObject({
      streak: 3,
      today: { activities: 1, sessions: 1, minutes: 0 },
      week: { sessions: 3, activeDays: 4, minutes: 50 }
    });
  });

  test('retorna a semana de segunda a domingo, inclusive na virada do ano', () => {
    const days = StudyTracker.weekDays(new Date(2027, 0, 1, 12));

    expect(days.map(day => day.date)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03'
    ]);
  });
});
