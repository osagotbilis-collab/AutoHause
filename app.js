const API_URL = 'https://script.google.com/macros/s/AKfycbx2gvBUOQki92yBN6M_aF0oySYs2C-wS-q8vFaM_eH_JymvnAo0dKfzy1r8s5VKgIa9/exec';
const STORAGE_KEY = 'auto_schedule_data_v4';

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
let store = {
  cells: {},
  edited: {}
};

function generateTimeSlots() {
  const slots = [];
  const pad = n => String(n).padStart(2, '0');
  let minutes = 7 * 60 + 30;
  const endMinutes = 21 * 60;

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

function getDateColumns() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cols = [];

  for (let offset = -14; offset <= 21; offset++) {
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
          cells: parsed.cells || {},
          edited: parsed.edited || {}
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

function saveCellChange(cellKey, newValue, cellEl) {
  store.cells[cellKey] = newValue;
  store.edited[cellKey] = Date.now() + 14 * 24 * 60 * 60 * 1000;
  
  saveLocalStore();
  setStatus('Сохранение...');

  if (API_URL && API_URL.startsWith('http')) {
    fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateCell', key: cellKey, value: newValue })
    })
      .then(() => setStatus('Сохранено'))
      .catch(() => setStatus('Сохранено локально (нет сети)', true));
  } else {
    setStatus('Сохранено локально');
  }
}

function renderTable(preserveScroll) {
  const scroller = document.getElementById('scrollContainer');
  const prevScroll = scroller ? scroller.scrollLeft : 0;
  const table = document.getElementById('scheduleTable');
  if (!table) return;

  const allCols = getDateColumns();
  const visibleCols = showArchive ? allCols : allCols.filter(c => !c.isPast);
  const nowMs = Date.now();

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
    timeTd.textContent = slot;
    tr.appendChild(timeTd);

    visibleCols.forEach(col => {
      const td = document.createElement('td');
      if (col.isPast) td.classList.add('archive-col');

      if (col.isSunday) {
        td.classList.add('sunday-col');
        tr.appendChild(td);
        return;
      }

      const cellKey = `${col.key}|${slot}`;
      const val = store.cells[cellKey] || '';
      td.textContent = val;

     

      if (isEditEnabled) {
        td.contentEditable = 'true';
        td.addEventListener('blur', () => {
          if (td.textContent !== val) {
            saveCellChange(cellKey, td.textContent, td);
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
      const stickyW = headers ? headers.offsetWidth : 88;
      const targetTh = headers[todayColIndex];
      if (targetTh) {
        scroller.scrollLeft = Math.max(0, targetTh.offsetLeft - stickyW);
      }
    }
  }, 30);
}

function syncFromServer() {
  if (!API_URL || !API_URL.startsWith('http')) return;
  setStatus('Синхронизация...');
  fetch(`${API_URL}?api=1&t=${Date.now()}`, { redirect: 'follow' })
    .then(r => r.json())
    .then(data => {
      if (data && data.cells) {
        store.cells = data.cells || store.cells;
        store.edited = data.edited || store.edited;
        saveLocalStore();
        renderTable(true);
      }
      setStatus('В сети');
    })
    .catch(() => setStatus('Офлайн-режим', true));
}

function initApp() {
  loadLocalStore();
  renderTable(false);
  syncFromServer();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) syncFromServer();
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
