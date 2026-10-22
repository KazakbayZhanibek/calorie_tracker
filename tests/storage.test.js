import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, DEFAULT_GOAL } from '../calorie_tracker/static/storage.js';

class MemoryStorage {
  values = new Map();
  writes = 0;
  failRead = false;
  failWrite = false;

  getItem(key) {
    if (this.failRead) throw new Error('Storage access denied');
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrite) throw new Error('Storage quota exceeded');
    this.values.set(key, String(value));
    this.writes += 1;
  }

  removeItem(key) { this.values.delete(key); }
}

const DAY = '2026-10-22';
const OTHER_DAY = '2026-10-21';
const food = (overrides = {}) => ({
  food_name: 'Яблоко', calories: 52, quantity: 1, date: DAY, ...overrides,
});

test('empty storage has the default goal and no entries, without writing during reads', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  assert.equal(STORAGE_KEY, 'calorie-tracker:data:v1');
  assert.equal(DEFAULT_GOAL, 2000);
  assert.deepEqual(store.getSummary(DAY), {
    date: DAY, total_calories: 0, entry_count: 0, daily_goal: 2000,
  });
  assert.deepEqual(store.getEntries(DAY), []);
  assert.deepEqual(store.getHistory(), []);
  assert.equal(storage.writes, 0);
});

test('entries and goal survive recreating the store and remain scoped by date', () => {
  const storage = new MemoryStorage();
  const first = createStore(storage);
  first.addEntry(food({ food_name: '  Яблоко  ', quantity: 1.5 }));
  first.addEntry(food({ food_name: 'Суп', calories: 150, date: OTHER_DAY }));
  first.setGoal(2300);

  const reloaded = createStore(storage);
  const entries = reloaded.getEntries(DAY);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].food_name, 'Яблоко');
  assert.equal(entries[0].quantity, 1.5);
  assert.equal(typeof entries[0].id, 'string');
  assert.ok(entries[0].id.length > 0);
  assert.ok(Number.isFinite(Date.parse(entries[0].created_at)));
  assert.deepEqual(reloaded.getSummary(DAY), {
    date: DAY, total_calories: 78, entry_count: 1, daily_goal: 2300,
  });
  assert.equal(reloaded.getEntries(OTHER_DAY).length, 1);
  assert.deepEqual(reloaded.getHistory(), [
    { date: DAY, total: 78 }, { date: OTHER_DAY, total: 150 },
  ]);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.version, 1);
  assert.equal(saved.dailyGoal, 2300);
  assert.equal(saved.entries.length, 2);
});

test('rounded per-entry calories agree in summary and history', () => {
  const store = createStore(new MemoryStorage());
  store.addEntry(food({ calories: 1, quantity: 0.5 }));
  store.addEntry(food({ calories: 1, quantity: 0.5 }));
  assert.equal(store.getSummary(DAY).total_calories, 2);
  assert.deepEqual(store.getHistory(), [{ date: DAY, total: 2 }]);
});

test('deleting the last entry resets totals and removes its history date after reload', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.addEntry(food());
  store.addEntry(food({ date: OTHER_DAY }));
  const deletedId = store.getEntries(DAY)[0].id;
  const keptId = store.getEntries(OTHER_DAY)[0].id;
  assert.notEqual(deletedId, keptId);
  store.deleteEntry(deletedId);

  const reloaded = createStore(storage);
  assert.deepEqual(reloaded.getEntries(DAY), []);
  assert.equal(reloaded.getEntries(OTHER_DAY)[0].id, keptId);
  assert.deepEqual(reloaded.getSummary(DAY), {
    date: DAY, total_calories: 0, entry_count: 0, daily_goal: DEFAULT_GOAL,
  });
  assert.deepEqual(reloaded.getHistory(), [{ date: OTHER_DAY, total: 52 }]);
});

test('history is sorted by calendar date and returns the last 14 nonempty dates', () => {
  const store = createStore(new MemoryStorage());
  for (let day = 20; day >= 1; day -= 1) {
    store.addEntry(food({ date: `2026-10-${String(day).padStart(2, '0')}`, calories: day }));
  }
  const history = store.getHistory();
  assert.equal(history.length, 14);
  assert.deepEqual(history[0], { date: '2026-10-20', total: 20 });
  assert.deepEqual(history[13], { date: '2026-10-07', total: 7 });
  assert.deepEqual(store.getHistory(2), history.slice(0, 2));
  assert.equal(store.getEntries('2026-10-01').length, 1);
});

test('invalid entry inputs are rejected without changing persisted data', () => {
  const invalidEntries = [
    { food_name: '' }, { food_name: '  ' }, { food_name: null },
    { calories: 0 }, { calories: -1 }, { calories: NaN },
    { calories: Infinity }, { calories: 1.5 },
    { quantity: 0 }, { quantity: -1 }, { quantity: NaN }, { quantity: Infinity },
    { calories: Number.MAX_SAFE_INTEGER, quantity: 2 },
    { date: '' }, { date: '2026-2-01' }, { date: '2026-02-29' },
    { date: '2026-04-31' }, { date: '2026-13-01' }, { date: '2026-00-10' },
    { date: '2026-10-00' }, { date: '2026-10-22T00:00:00Z' },
  ];
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.addEntry(food());
  const before = storage.getItem(STORAGE_KEY);
  for (const entry of invalidEntries) {
    assert.throws(() => store.addEntry(food(entry)), `Expected rejection: ${JSON.stringify(entry)}`);
    assert.equal(storage.getItem(STORAGE_KEY), before);
  }
  store.addEntry(food({ date: '2024-02-29' }));
  assert.equal(store.getEntries('2024-02-29').length, 1);
});

test('invalid goals are rejected and the prior goal remains saved', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.setGoal(2500);
  const before = storage.getItem(STORAGE_KEY);
  for (const goal of [0, -100, 99, 100.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => store.setGoal(goal));
    assert.equal(storage.getItem(STORAGE_KEY), before);
  }
  store.setGoal(100);
  assert.equal(createStore(storage).getSummary(DAY).daily_goal, 100);
});

test('corrupt JSON and incompatible stored data are not silently replaced', () => {
  const invalidStoredValues = [
    '{broken', 'null', '[]',
    JSON.stringify({ version: 2, dailyGoal: 2000, entries: [] }),
    JSON.stringify({ version: 1, dailyGoal: 2000, entries: {} }),
    JSON.stringify({ version: 1, dailyGoal: -1, entries: [] }),
    JSON.stringify({ version: 1, dailyGoal: 2000, entries: [{}] }),
  ];
  for (const raw of invalidStoredValues) {
    const storage = new MemoryStorage();
    storage.values.set(STORAGE_KEY, raw);
    assert.throws(() => createStore(storage).getSummary(DAY));
    assert.throws(() => createStore(storage).addEntry(food()));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.equal(storage.writes, 0);
  }
});

test('blocked reads report failure and do not replace existing saved records', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.addEntry(food());
  const before = storage.getItem(STORAGE_KEY);
  storage.failRead = true;
  assert.throws(() => store.getEntries(DAY));
  assert.throws(() => store.addEntry(food({ food_name: 'Не сохранено' })));
  assert.throws(() => store.setGoal(3000));
  storage.failRead = false;
  assert.equal(storage.getItem(STORAGE_KEY), before);
});

test('failed writes report failure and preserve records, goal, and in-memory reads', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.addEntry(food());
  const id = store.getEntries(DAY)[0].id;
  const before = storage.getItem(STORAGE_KEY);
  storage.failWrite = true;
  assert.throws(() => store.addEntry(food({ food_name: 'Не сохранено' })));
  assert.throws(() => store.setGoal(3000));
  assert.throws(() => store.deleteEntry(id));
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.equal(store.getEntries(DAY).length, 1);
  assert.equal(store.getSummary(DAY).daily_goal, DEFAULT_GOAL);
  storage.failWrite = false;
  store.deleteEntry(id);
  assert.deepEqual(createStore(storage).getEntries(DAY), []);
});

test('sequential writes from two already-created stores preserve each other’s changes', () => {
  const storage = new MemoryStorage();
  const first = createStore(storage);
  const second = createStore(storage);
  first.addEntry(food({ food_name: 'Первое' }));
  second.addEntry(food({ food_name: 'Второе' }));
  first.setGoal(2400);
  second.addEntry(food({ food_name: 'Третье' }));
  assert.deepEqual(first.getEntries(DAY).map(entry => entry.food_name), ['Первое', 'Второе', 'Третье']);
  assert.equal(second.getSummary(DAY).daily_goal, 2400);
  first.deleteEntry(first.getEntries(DAY)[0].id);
  assert.equal(second.getEntries(DAY).length, 2);
});

test('food names containing HTML are retained as data', () => {
  const store = createStore(new MemoryStorage());
  const name = '<img src=x onerror="alert(1)"> & яблоко';
  store.addEntry(food({ food_name: name }));
  assert.equal(store.getEntries(DAY)[0].food_name, name);
});

test('mutating returned records cannot change saved data', () => {
  const store = createStore(new MemoryStorage());
  store.addEntry(food());
  const entries = store.getEntries(DAY);
  entries[0].food_name = 'Изменено без сохранения';
  entries.push({});
  assert.equal(store.getEntries(DAY).length, 1);
  assert.equal(store.getEntries(DAY)[0].food_name, 'Яблоко');
});
