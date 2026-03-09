
const API = "";
let currentDate = todayStr();
let dailyGoal = 2000;

function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(API + url, opts);
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

async function loadAll() {
  try {
    const [summary, entries, history] = await Promise.all([
      fetchJSON(`/api/summary?date=${currentDate}`),
      fetchJSON(`/api/entries?date=${currentDate}`),
      fetchJSON("/api/history"),
    ]);
    dailyGoal = summary.daily_goal;
    renderSummary(summary);
    renderEntries(entries);
    renderHistory(history, summary.daily_goal);
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
    document.getElementById("emptyState").textContent = "Ошибка загрузки данных";
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
      <td><button class="btn-del" data-id="${e.id}">✕</button></td>
    </tr>`;
  }).join("");
  document.getElementById("footTotal").textContent = total;
}

// Обработчик удаления записей через event delegation
document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("btn-del")) {
    const id = e.target.dataset.id;
    if (!confirm("Удалить эту запись?")) return;
    try {
      await fetchJSON(`/api/entries/${id}`, { method: "DELETE" });
      loadAll();
    } catch (err) {
      alert("Ошибка при удалении: " + err.message);
    }
  }
});

function renderHistory(history, goal) {
  const el = document.getElementById("historyList");
  if (!history.length) { el.innerHTML = ""; return; }
  el.innerHTML = history.map(h => {
    const cls = h.total <= goal ? "good" : "over";
    const d = new Date(h.date);
    const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });
    return `<div class="history-item" onclick="goToDate('${h.date}')">
      <span class="date">${label}</span>
      <span class="cal-val ${cls}">${h.total} ккал</span>
    </div>`;
  }).join("");
}

function goToDate(d) {
  currentDate = d;
  document.getElementById("datePicker").value = d;
  loadAll();
}

async function deleteEntry(id) {
  if (!confirm("Удалить эту запись?")) return;
  try {
    await fetchJSON(`/api/entries/${id}`, { method: "DELETE" });
    loadAll();
  } catch (err) {
    alert("Ошибка при удалении: " + err.message);
  }
}

document.getElementById("addForm").addEventListener("submit", async e => {
  e.preventDefault();
  const food_name = document.getElementById("foodName").value.trim();
  const calories = parseInt(document.getElementById("calories").value);
  const quantity = parseFloat(document.getElementById("quantity").value);
  try {
    await fetchJSON("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_name, calories, quantity, date: currentDate }),
    });
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
document.getElementById("btnSaveGoal").addEventListener("click", async () => {
  const val = parseInt(document.getElementById("goalInput").value);
  if (!val || val < 100) {
    alert("Цель должна быть не менее 100 ккал");
    return;
  }
  try {
    await fetchJSON("/api/settings/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_goal: val }),
    });
    document.getElementById("goalModal").classList.add("hidden");
    loadAll();
  } catch (err) {
    alert("Ошибка при сохранении: " + err.message);
  }
});

function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
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
  const savedTheme = localStorage.getItem("theme") || "light";
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
  localStorage.setItem("theme", theme);
  document.getElementById("btnTheme").textContent = isDarkMode ? "☀️" : "🌙";
}

const dp = document.getElementById("datePicker");
dp.value = currentDate;
initTheme();
loadAll();
