export const STORAGE_KEY = "calorie-tracker:data:v1";
export const DEFAULT_GOAL = 2000;

const MAX_TOTAL = Number.MAX_SAFE_INTEGER;
const INVALID_DATA = "Сохранённые данные повреждены или имеют неподдерживаемый формат. Они не были изменены.";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T12:00:00Z`);
  return year >= 1 && Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function requireDate(value) {
  if (!validDate(value)) throw new Error("Выберите корректную дату.");
  return value;
}

function validGoal(value) {
  return Number.isSafeInteger(value) && value >= 100;
}

function entryTotal(entry) {
  return Math.round(entry.calories * entry.quantity);
}

function validFood(entry) {
  return typeof entry.food_name === "string" && entry.food_name.trim().length > 0 &&
    Number.isSafeInteger(entry.calories) && entry.calories > 0 &&
    Number.isFinite(entry.quantity) && entry.quantity > 0 &&
    Number.isSafeInteger(entryTotal(entry)) && entryTotal(entry) >= 0;
}

function dailyTotals(entries) {
  const totals = new Map();
  for (const entry of entries) {
    const total = (totals.get(entry.date) || 0) + entryTotal(entry);
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL) {
      throw new Error("Сумма калорий слишком велика. Уменьшите калорийность или количество порций.");
    }
    totals.set(entry.date, total);
  }
  return totals;
}

function validateState(state) {
  if (!state || typeof state !== "object" || state.version !== 1 ||
      !validGoal(state.dailyGoal) || !Array.isArray(state.entries)) {
    throw new Error(INVALID_DATA);
  }
  const ids = new Set();
  for (const entry of state.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id ||
        ids.has(entry.id) || !validFood(entry) || !validDate(entry.date) ||
        typeof entry.created_at !== "string" || !Number.isFinite(Date.parse(entry.created_at))) {
      throw new Error(INVALID_DATA);
    }
    ids.add(entry.id);
  }
  try {
    dailyTotals(state.entries);
  } catch {
    throw new Error(INVALID_DATA);
  }
  return state;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Browser storage is accessed lazily so the UI can display denied-storage errors. */
export function createStore(storage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
}) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      throw new Error("Браузер запретил доступ к сохранённым данным. Разрешите хранение данных для этого сайта.");
    }
    if (raw === null) return { version: 1, dailyGoal: DEFAULT_GOAL, entries: [] };
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new Error(INVALID_DATA);
    }
    return validateState(state);
  }

  function write(state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (error?.name === "QuotaExceededError" || error?.name === "NS_ERROR_DOM_QUOTA_REACHED") {
        throw new Error("Не удалось сохранить: хранилище браузера заполнено. Освободите место и повторите попытку.");
      }
      throw new Error("Не удалось сохранить данные. Разрешите хранение данных для этого сайта и повторите попытку.");
    }
  }

  return {
    getEntries(date = today()) {
      requireDate(date);
      return read().entries.filter(entry => entry.date === date)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    getSummary(date = today()) {
      requireDate(date);
      const state = read();
      const entries = state.entries.filter(entry => entry.date === date);
      return {
        date,
        total_calories: dailyTotals(entries).get(date) || 0,
        entry_count: entries.length,
        daily_goal: state.dailyGoal,
      };
    },

    getHistory(limit = 14) {
      if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Некорректный размер истории.");
      return [...dailyTotals(read().entries)]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, limit)
        .map(([date, total]) => ({ date, total }));
    },

    addEntry(input) {
      if (!input || typeof input !== "object") throw new Error("Введите данные продукта.");
      const entry = {
        id: makeId(),
        food_name: typeof input.food_name === "string" ? input.food_name.trim() : "",
        calories: input.calories,
        quantity: input.quantity ?? 1,
        date: requireDate(input.date ?? today()),
        created_at: new Date().toISOString(),
      };
      if (!entry.food_name) throw new Error("Введите название продукта.");
      if (!Number.isSafeInteger(entry.calories) || entry.calories <= 0) {
        throw new Error("Калорийность должна быть положительным целым числом.");
      }
      if (!validFood(entry)) throw new Error("Укажите корректное положительное количество порций.");
      // Re-read for every mutation so sequential writes from other tabs are retained.
      const state = read();
      while (state.entries.some(item => item.id === entry.id)) entry.id = makeId();
      state.entries.push(entry);
      dailyTotals(state.entries);
      write(state);
      return { ...entry };
    },

    deleteEntry(id) {
      const state = read();
      const index = state.entries.findIndex(entry => entry.id === id);
      if (index === -1) throw new Error("Запись уже удалена или не найдена. Обновите страницу.");
      state.entries.splice(index, 1);
      write(state);
    },

    setGoal(dailyGoal) {
      if (!validGoal(dailyGoal)) throw new Error("Цель должна быть целым числом не менее 100 ккал.");
      const state = read();
      state.dailyGoal = dailyGoal;
      write(state);
      return { daily_goal: dailyGoal };
    },
  };
}
