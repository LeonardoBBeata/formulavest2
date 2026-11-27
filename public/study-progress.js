(() => {
  const ENDPOINT = '/me/study-progress';
  const KEYS = {
    activities: 'studyActivityLog',
    plan: 'planoDia',
    planDate: 'planoDiaDate',
    goals: 'metas',
    goalsDate: 'metasDate',
    lessons: 'lessonProgress',
    updatedAt: 'studyProgressUpdatedAt'
  };
  let loadPromise;
  let saveTimer;
  let saveInProgress = false;
  let changedDuringSave = false;
  let syncErrorVisible = false;

  function parseArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn(`Não foi possível ler ${key} para sincronização.`, error);
      return [];
    }
  }

  function parseObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.warn(`Não foi possível ler ${key} para sincronização.`, error);
      return {};
    }
  }

  function currentDate() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  function localProgress() {
    const today = currentDate();
    return {
      activities: parseArray(KEYS.activities),
      planDate: localStorage.getItem(KEYS.planDate) || today,
      plan: parseArray(KEYS.plan),
      goalsDate: localStorage.getItem(KEYS.goalsDate) || today,
      goals: parseArray(KEYS.goals),
      lessons: parseObject(KEYS.lessons),
      updatedAt: localStorage.getItem(KEYS.updatedAt) || ''
    };
  }

  function activityKey(activity) {
    return `${activity.date}|${activity.kind}|${activity.minutes}`;
  }

  function mergeActivities(local, remote) {
    const merged = [];
    const ids = new Set();
    const legacyCounts = new Map();
    const candidates = [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])];

    candidates.forEach(activity => {
      if (!activity || typeof activity !== 'object') return;
      if (activity.id) {
        if (ids.has(activity.id)) return;
        ids.add(activity.id);
        merged.push(activity);
        return;
      }

      const key = activityKey(activity);
      const currentCount = legacyCounts.get(key) || 0;
      const localCount = (Array.isArray(local) ? local : []).filter(item => item && !item.id && activityKey(item) === key).length;
      const remoteCount = (Array.isArray(remote) ? remote : []).filter(item => item && !item.id && activityKey(item) === key).length;
      const targetCount = Math.max(localCount, remoteCount);
      if (currentCount < targetCount) {
        merged.push(activity);
        legacyCounts.set(key, currentCount + 1);
      }
    });

    return merged.slice(-5000);
  }

  function newerState(local, remote) {
    const localDate = String(local.updatedAt || '');
    const remoteDate = String(remote.updatedAt || '');
    return localDate >= remoteDate ? local : remote;
  }

  function mergeProgress(local, remote) {
    const preferred = newerState(local, remote);
    const lessons = { ...(remote.lessons || {}) };

    Object.entries(local.lessons || {}).forEach(([id, lesson]) => {
      const previous = lessons[id];
      if (!previous || Number(lesson?.score || 0) > Number(previous.score || 0)) {
        lessons[id] = lesson;
      } else if (lesson?.completedAt && new Date(lesson.completedAt) > new Date(previous.completedAt)) {
        lessons[id] = { ...previous, completedAt: lesson.completedAt };
      }
    });

    return {
      activities: mergeActivities(local.activities, remote.activities),
      planDate: preferred.planDate,
      plan: preferred.plan,
      goalsDate: preferred.goalsDate,
      goals: preferred.goals,
      lessons,
      updatedAt: preferred.updatedAt
    };
  }

  function writeLocal(progress) {
    localStorage.setItem(KEYS.activities, JSON.stringify(progress.activities));
    localStorage.setItem(KEYS.planDate, progress.planDate);
    localStorage.setItem(KEYS.plan, JSON.stringify(progress.plan));
    localStorage.setItem(KEYS.goalsDate, progress.goalsDate);
    localStorage.setItem(KEYS.goals, JSON.stringify(progress.goals));
    localStorage.setItem(KEYS.lessons, JSON.stringify(progress.lessons));
    if (progress.updatedAt) localStorage.setItem(KEYS.updatedAt, progress.updatedAt);
  }

  function emitSyncError() {
    if (syncErrorVisible) return;
    syncErrorVisible = true;
    window.dispatchEvent(new CustomEvent('study-progress-sync-error'));
  }

  function clearSyncError() {
    syncErrorVisible = false;
  }

  async function sendProgress(progress) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progress)
        });
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        continue;
      }

      if (response.ok) {
        clearSyncError();
        return;
      }
      const error = new Error('Falha ao sincronizar progresso');
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
    throw lastError || new Error('Falha ao sincronizar progresso');
  }

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const local = localProgress();
      try {
        const response = await fetch(ENDPOINT, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Falha ao carregar progresso da conta');
        clearSyncError();
        const data = await response.json();
        const remote = data.progress || {};
        const remoteProgress = {
          activities: Array.isArray(remote.activities) ? remote.activities : [],
          planDate: remote.planDate || currentDate(),
          plan: Array.isArray(remote.plan) ? remote.plan : [],
          goalsDate: remote.goalsDate || currentDate(),
          goals: Array.isArray(remote.goals) ? remote.goals : [],
          lessons: remote.lessons && typeof remote.lessons === 'object' ? remote.lessons : {},
          updatedAt: data.updated_at || ''
        };
        const merged = mergeProgress(local, remoteProgress);
        writeLocal(merged);

        if (JSON.stringify(merged) !== JSON.stringify(remoteProgress)) {
          try {
            await sendProgress(merged);
            localStorage.setItem(KEYS.updatedAt, new Date().toISOString());
          } catch (error) {
            console.error('Não foi possível sincronizar o progresso inicial.', error);
            emitSyncError();
          }
        }
        return merged;
      } catch (error) {
        console.error('Não foi possível carregar o progresso da conta.', error);
        emitSyncError();
        return local;
      }
    })();
    return loadPromise;
  }

  async function flush() {
    if (saveInProgress) {
      changedDuringSave = true;
      return;
    }

    saveInProgress = true;
    try {
      do {
        changedDuringSave = false;
        const progress = localProgress();
        const updatedAt = new Date().toISOString();
        progress.updatedAt = updatedAt;
        localStorage.setItem(KEYS.updatedAt, updatedAt);
        const { updatedAt: ignored, ...payload } = progress;
        await sendProgress(payload);
      } while (changedDuringSave);
    } catch (error) {
      console.error('Não foi possível salvar o progresso na conta.', error);
      emitSyncError();
    } finally {
      saveInProgress = false;
    }
  }

  function scheduleSave() {
    localStorage.setItem(KEYS.updatedAt, new Date().toISOString());
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 700);
  }

  window.StudyProgress = { load, scheduleSave };
})();
