
import { createStore, STORAGE_KEY } from "./storage.js";

const store = createStore();
let currentDate = todayStr();
let dailyGoal = 2000;

function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}

function loadAll() {
  try {
    const summary = store.getSummary(currentDate);
    const entries = store.getEntries(currentDate);
    const history = store.getHistory();
    dailyGoal = summary.daily_goal;
    renderSummary(summary);
    renderEntries(entries);
    renderHistory(history, summary.daily_goal);
    document.getElementById("storageError").hidden = true;
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
    const message = document.getElementById("storageError");
    message.textContent = err.message;
    message.hidden = false;
  }
}

function renderSummary(s) {
  const total = s.total_calories;
  const goal = s.daily_goal;
  document.getElementById("totalCalories").textContent = total;
  document.getElementById("goalDisplay").textContent = goal;
  
  // Обновляем дату
  const d = new Date(currentDate + "T00:00:00");
  const dayName = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });
  document.getElementById("summaryDate").textContent = dayName;
  
  const remaining = goal - total;
  const el = document.getElementById("calRemaining");
  const bar = document.getElementById("progressBar");
  const pct = Math.min((total / goal) * 100, 100);
  bar.style.width = pct + "%";
  if (remaining < 0) {
    el.textContent = `превышено на ${Math.abs(remaining)}`;
    el.className = "remaining over";
    bar.classList.add("over");
  } else {
    el.textContent = `осталось ${remaining}`;
    el.className = "remaining";
    bar.classList.remove("over");
  }
}

function renderEntries(entries) {
  const empty = document.getElementById("emptyState");
  const table = document.getElementById("entriesTable");
  const tbody = document.getElementById("entriesBody");
  if (!entries.length) {
    empty.textContent = "Нет записей за этот день";
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  table.classList.remove("hidden");
  let total = 0;
  tbody.innerHTML = entries.map(e => {
    const line = Math.round(e.calories * e.quantity);
    total += line;
    return `<tr>
      <td>${esc(e.food_name)}</td>
      <td>${e.calories}</td>
      <td>${e.quantity}</td>
      <td>${line}</td>
      <td><button class="btn-del" data-id="${esc(e.id)}" aria-label="Удалить запись">✕</button></td>
    </tr>`;
  }).join("");
  document.getElementById("footTotal").textContent = total;
}

let pendingDeleteId = null;
const deleteDialog = document.getElementById("deleteDialog");

// Подтверждение удаления остаётся внутри страницы.
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-del")) {
    pendingDeleteId = e.target.dataset.id;
    deleteDialog.showModal();
  }
});

document.getElementById("btnCancelDelete").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => { pendingDeleteId = null; });
document.getElementById("btnConfirmDelete").addEventListener("click", () => {
  try {
    store.deleteEntry(pendingDeleteId);
    deleteDialog.close();
    loadAll();
  } catch (err) {
    deleteDialog.close();
    const message = document.getElementById("storageError");
    message.textContent = err.message;
    message.hidden = false;
  }
});

function renderHistory(history, goal) {
  const el = document.getElementById("historyList");
  if (!history.length) { el.innerHTML = ""; return; }
  el.innerHTML = history.map(h => {
    const cls = h.total <= goal ? "good" : "over";
    const d = new Date(h.date + "T00:00:00");
    const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });
    return `<button type="button" class="history-item" data-date="${h.date}">
      <span class="date">${label}</span>
      <span class="cal-val ${cls}">${h.total} ккал</span>
    </button>`;
  }).join("");
}

function goToDate(d) {
  currentDate = d;
  document.getElementById("datePicker").value = d;
  loadAll();
}

document.getElementById("historyList").addEventListener("click", e => {
  const item = e.target.closest("[data-date]");
  if (item) goToDate(item.dataset.date);
});

document.getElementById("addForm").addEventListener("submit", e => {
  e.preventDefault();
  const food_name = document.getElementById("foodName").value.trim();
  const calories = Number(document.getElementById("calories").value);
  const quantity = Number(document.getElementById("quantity").value);
  try {
    store.addEntry({ food_name, calories, quantity, date: currentDate });
    document.getElementById("foodName").value = "";
    document.getElementById("calories").value = "";
    document.getElementById("quantity").value = "1";
    document.getElementById("foodName").focus();
    showSaveNotification();
    loadAll();
  } catch (err) {
    alert("Ошибка при добавлении записи: " + err.message);
  }
});

document.getElementById("datePicker").addEventListener("change", e => {
  if (!e.target.value) {
    e.target.value = currentDate;
    return;
  }
  currentDate = e.target.value;
  loadAll();
});

document.getElementById("btnGoal").addEventListener("click", () => {
  document.getElementById("goalInput").value = dailyGoal;
  document.getElementById("goalModal").classList.remove("hidden");
});

document.getElementById("btnTeam").addEventListener("click", () => {
  document.getElementById("teamModal").classList.remove("hidden");
});

document.getElementById("btnCancelGoal").addEventListener("click", () => {
  document.getElementById("goalModal").classList.add("hidden");
});

document.getElementById("btnCloseTeam").addEventListener("click", () => {
  document.getElementById("teamModal").classList.add("hidden");
});
document.getElementById("btnSaveGoal").addEventListener("click", () => {
  const val = Number(document.getElementById("goalInput").value);
  if (!Number.isSafeInteger(val) || val < 100) {
    alert("Цель должна быть не менее 100 ккал");
    return;
  }
  try {
    store.setGoal(val);
    document.getElementById("goalModal").classList.add("hidden");
    loadAll();
  } catch (err) {
    alert("Ошибка при сохранении: " + err.message);
  }
});

function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showSaveNotification(text = "✓ Запись сохранена") {
  const notification = document.createElement("div");
  notification.textContent = text;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #16a34a;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 101;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

function showMemeToast() {
  const toast = document.createElement("div");
  toast.textContent = "😂 Еу братан хватит жрать!";
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #fbbf24, #f97316);
    color: white;
    padding: 20px 40px;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 700;
    z-index: 102;
    animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    box-shadow: 0 8px 30px rgba(249, 115, 22, 0.4);
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "popOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Добавляем CSS анимации
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Modal backdrop close
document.getElementById("goalModal").addEventListener("click", (e) => {
  if (e.target.id === "goalModal") {
    document.getElementById("goalModal").classList.add("hidden");
  }
});

document.getElementById("teamModal").addEventListener("click", (e) => {
  if (e.target.id === "teamModal") {
    document.getElementById("teamModal").classList.add("hidden");
  }
});

// Переключение темы
document.getElementById("btnTheme").addEventListener("click", toggleTheme);

// Init
function initTheme() {
  let savedTheme = "light";
  try { savedTheme = localStorage.getItem("theme") || "light"; } catch { /* Data errors are shown by loadAll. */ }
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("btnTheme").textContent = "☀️";
  } else {
    document.body.classList.remove("dark-mode");
    document.getElementById("btnTheme").textContent = "🌙";
  }
}

function toggleTheme() {
  const isDarkMode = document.body.classList.toggle("dark-mode");
  const theme = isDarkMode ? "dark" : "light";
  try { localStorage.setItem("theme", theme); } catch { /* Theme can still change for this visit. */ }
  document.getElementById("btnTheme").textContent = isDarkMode ? "☀️" : "🌙";
}

const dp = document.getElementById("datePicker");
dp.value = currentDate;
initTheme();
loadAll();

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY || event.key === null) loadAll();
  if (event.key === "theme" || event.key === null) initTheme();
});
