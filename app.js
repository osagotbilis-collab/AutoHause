const API_URL = 'https://script.google.com/macros/s/AKfycbx2gvBUOQki92yBN6M_aF0oySYs2C-wS-q8vFaM_eH_JymvnAo0dKfzy1r8s5VKgIa9/exec';
const STORAGE_KEY = 'auto_schedule_data_v5';

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
let futureDaysLimit = 60; // Начальный запас дней вперёд (растёт бесконечно при прокрутке)
let currentTodayKey = '';
let isAppendingCols = false;

let store = {
  cells: {}
};

// Генерация интервалов времени строго с 08.00-08.30 до 19.30-20.00
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
    slots.push(`${pad(startH)}.${pad(startM)}-${pad(endH)}.${pad(endM)}`);
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

function renderTable(preserveScroll) {
  const scroller = document.getElementById('scrollContainer');
  const prevScroll = scroller ? scroller.scrollLeft : 0;
  const table = document.getElementById('scheduleTable');
  if (!table) return;

  const allCols = getDateColumns();
  const visibleCols = showArchive ? allCols : allCols.filter(c => !c.isPast);

  table.innerHTML = '';

  const theadRow = document.createElement('tr');
  const timeTh = document.createElement('th');
  timeTh.textContent = 'ВРЕМЯ';
  theadRow.appendChild(timeTh);

  let todayColIndex = -1;

  visibleCols.forEach((col, idx) => {
    if (col.isToday) todayColIndex = idx + 1;
    const th = document.createElement('th');
    if (col.isPast) th.classList.add('archive-col');
    if (col.isSunday) th.classList.add('sunday-col');

    const weekdaySpan = document.createElement('span');
    weekdaySpan.className = 'th-weekday';
    weekdaySpan.textContent = col.weekdayStr;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'th-date';
    dateSpan.textContent = col.dateStr;

    th.appendChild(weekdaySpan);
    th.appendChild(dateSpan);
    theadRow.appendChild(th);
  });

  table.appendChild(theadRow);

    TIME_SLOTS.forEach(slot => {
    const tr = document.createElement('tr');

    const timeTd = document.createElement('td');
    timeTd.textContent = slot.label;
    tr.appendChild(timeTd);

    visibleCols.forEach(col => {
      const td = document.createElement('td');
      if (col.isPast) td.classList.add('archive-col');

      if (col.isSunday) {
        td.classList.add('sunday-col');
      } else if (slot.isOffHours) {
        td.classList.add('off-hours-col');
      }

      const cellKey = `${col.key}|${slot.label}`;
      const val = store.cells[cellKey] || '';
      td.textContent = val;

      if (isEditEnabled) {
        td.contentEditable = 'true';
        td.addEventListener('blur', () => {
          if (td.textContent !== val) {
            saveCellChange(cellKey, td.textContent);
          }
        });
      }

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });


  setTimeout(() => {
    if (!scroller) return;
    if (preserveScroll) {
      scroller.scrollLeft = prevScroll;
    } else if (todayColIndex > 0) {
      const headers = table.querySelectorAll('tr:first-child th');
      const stickyW = headers ? headers.offsetWidth : 76;
      const targetTh = headers[todayColIndex];
      if (targetTh) {
        scroller.scrollLeft = Math.max(0, targetTh.offsetLeft - stickyW);
      }
    }
    isAppendingCols = false;
  }, 30);
}

// Проверка наступления нового утра (смены даты)
function checkNewDayAndShift() {
  const actualTodayKey = toDateKey(getTodayDate());
  if (currentTodayKey && actualTodayKey !== currentTodayKey) {
    showArchive = false;
    const btn = document.getElementById('archiveBtn');
    if (btn) {
      btn.classList.remove('active');
      btn.textContent = 'АРХИВ';
    }
    renderTable(false);
  }
}

// Бесконечная подгрузка будущих дат при прокрутке вправо
function setupInfiniteScroll() {
  const scroller = document.getElementById('scrollContainer');
  if (!scroller) return;

  scroller.addEventListener('scroll', () => {
    if (isAppendingCols) return;
    // Не перерисовываем во время активного набора текста в ячейке
    if (document.activeElement && document.activeElement.isContentEditable) return;

    const distanceToRight = scroller.scrollWidth - (scroller.scrollLeft + scroller.clientWidth);
    if (distanceToRight < 450) {
      isAppendingCols = true;
      futureDaysLimit += 30;
      renderTable(true);
    }
  });
}

function syncFromServer() {
  if (!API_URL || !API_URL.startsWith('http')) return;
  if (!navigator.onLine) {
    setStatus('Нет сети\nГрафик не обновляется', true);
    return;
  }
  setStatus('Синхронизация...');
  fetch(`${API_URL}?api=1&t=${Date.now()}`, { redirect: 'follow' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      if (data && data.cells) {
        store.cells = data.cells || store.cells;
        saveLocalStore();
        renderTable(true);
      }
      setStatus('В сети');
    })
    .catch(() => setStatus('Нет сети\nГрафик не обновляется', true));
}

function initApp() {
  loadLocalStore();
  renderTable(false);
  setupInfiniteScroll();
  syncFromServer();

  // Каждую минуту проверяем, не наступил ли новый день (утро)
  setInterval(checkNewDayAndShift, 60000);

  window.addEventListener('online', () => {
    checkNewDayAndShift();
    syncFromServer();
  });

  window.addEventListener('offline', () => {
    setStatus('Нет сети\nГрафик не обновляется', true);
  });

  window.addEventListener('focus', () => {
    checkNewDayAndShift();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkNewDayAndShift();
      if (navigator.onLine) syncFromServer();
      else setStatus('Нет сети\nГрафик не обновляется', true);
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
