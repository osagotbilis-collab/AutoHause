const API_URL = 'https://google.com';
const STORAGE_KEY = 'auto_schedule_data_v6';

const WEEKDAYS_RU = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота'
];

let isEditEnabled = false;
let showArchive = false;
let futureDaysLimit = 60;
let currentTodayKey = '';
let isAppendingCols = false;

let store = {
  cells: {}
};

// Генерация интервалов с 08.00 до 20.00 с пометкой нерабочих часов
function generateTimeSlots() {
  const slots = [];
  const pad = n => String(n).padStart(2, '0');
  let minutes = 8 * 60;
  const endMinutes = 20 * 60;

  while (minutes < endMinutes) {
    const startH = Math.floor(minutes / 60);
    const startM = minutes % 60;
    const next = minutes + 30;
    const endH = Math.floor(next / 60);
    const endM = next % 60;

    // Нерабочее время: до 09:00, обед 12:00-13:00, после 18:00
    const isOffHours = (minutes < 9 * 60) || (minutes >= 12 * 60 && minutes < 13 * 60) || (minutes >= 18 * 60);

    slots.push({
      label: `${pad(startH)}.${pad(startM)}-${pad(endH)}.${pad(endM)}`,
      isOffHours: isOffHours
    });
    minutes = next;
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function toDateKey(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateDots(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function getTodayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getDateColumns() {
  const today = getTodayDate();
  currentTodayKey = toDateKey(today);
  const cols = [];

  for (let offset = -30; offset <= futureDaysLimit; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const dayOfWeek = d.getDay();
    cols.push({
      key: toDateKey(d),
      dateStr: formatDateDots(d),
      weekdayStr: WEEKDAYS_RU[dayOfWeek],
      isSunday: dayOfWeek === 0,
      isPast: offset < 0,
      isToday: offset === 0
    });
  }
  return cols;
}

function loadLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store = {
          cells: parsed.cells || {}
        };
      }
    }
  } catch (e) {}
}

function saveLocalStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {}
}

function setStatus(text, isError = false) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.style.color = isError ? '#d93025' : '#1a73e8';
  el.textContent = text;
}

function toggleEditMode() {
  isEditEnabled = !isEditEnabled;
  const btn = document.getElementById('editToggleBtn');
  const group = document.getElementById('editControlGroup');
  if (btn) {
    btn.setAttribute('aria-checked', isEditEnabled ? 'true' : 'false');
    btn.classList.toggle('active', isEditEnabled);
  }
  if (group) group.classList.toggle('active', isEditEnabled);
  renderTable(true);
}

function toggleArchive() {
  showArchive = !showArchive;
  const btn = document.getElementById('archiveBtn');
  if (btn) {
    btn.classList.toggle('active', showArchive);
    btn.textContent = showArchive ? 'СКРЫТЬ АРХИВ' : 'АРХИВ';
  }
  renderTable(false);
}

function saveCellChange(cellKey, newValue) {
  store.cells[cellKey] = newValue;
  saveLocalStore();
  setStatus('Сохранение...');

  if (API_URL && API_URL.startsWith('http')) {
    fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateCell', key: cellKey, value: newValue })
    })
      .then(() => {
        setStatus('Сохранено');
        setTimeout(() => {
          const el = document.getElementById('syncStatus');
          if (el && el.textContent === 'Сохранено') {
            if (navigator.onLine) {
              setStatus('В сети');
            } else {
              setStatus('Нет сети\nГрафик не обновляется', true);
            }
          }
        }, 1500);
      })
      .catch(() => setStatus('Нет сети\nГрафик не обновляется', true));
  } else {
    setStatus('Сохранено');
  }
}
