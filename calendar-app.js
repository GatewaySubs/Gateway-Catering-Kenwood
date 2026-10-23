// Gateway Subs store catering calendars — shared by every store's page.
// Each store's index.html sets window.STORE = { key, name, city, calendarId } and loads this file,
// so a change here shows up on all five calendars at once, while each store only ever sees its own.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
// The page itself.
document.body.insertAdjacentHTML('afterbegin', `
<div class="page">
  <header>
    <div class="brand">
      <div class="logo-mark">GS</div>
      <div class="brand-text"><h1>Gateway Subs</h1><p>Catering Calendar</p></div>
    </div>
    <div class="header-right">
      <span class="updated" id="updated"></span>
      <div class="badge">${esc(window.STORE.name)}</div>
      <div class="badge" style="color:var(--accent)"><div class="live-dot"></div>Live</div>
    </div>
  </header>

  <div class="toolbar">
    <div class="view-toggle">
      <button class="view-btn" id="btn-next" onclick="switchView('next')">Next 3 days</button>
      <button class="view-btn" id="btn-month" onclick="switchView('month')">Month</button>
      <button class="view-btn" id="btn-list" onclick="switchView('list')">Upcoming</button>
    </div>
    <div class="legend"><span>✅ printed</span><span>🖨️ needs printing</span><span>⏰ late</span><span>📄 has a printout</span></div>
  </div>

  <div id="loading" class="empty">Loading catering orders…</div>
  <div id="view-next" class="hidden"></div>
  <div id="view-month" class="hidden">
    <div class="month-nav">
      <button class="nav-btn" onclick="changeMonth(-1)">&#8249;</button>
      <h2 id="monthLabel"></h2>
      <button class="nav-btn" onclick="changeMonth(1)">&#8250;</button>
    </div>
    <div class="day-headers"><div class="day-header">Sun</div><div class="day-header">Mon</div><div class="day-header">Tue</div><div class="day-header">Wed</div><div class="day-header">Thu</div><div class="day-header">Fri</div><div class="day-header">Sat</div></div>
    <div class="days-grid" id="daysGrid"></div>
  </div>
  <div id="view-list" class="hidden"></div>

  <footer>Gateway Subs &nbsp;·&nbsp; ${esc(window.STORE.city)} &nbsp;·&nbsp; Updates by itself every 5 minutes</footer>
</div>

<div class="modal-overlay hidden" id="modal" onclick="if(event.target.id==='modal')closeModal()">
  <div class="modal"><button class="modal-close" onclick="closeModal()">×</button><div id="modalBody"></div></div>
</div>

`);

const STORE = window.STORE;   // set by each store's own page: { key, name, city, calendarId }
const STORE_KEY = STORE.key;
const CALENDAR_ID = STORE.calendarId;
const API_KEY = 'AIzaSyDpukszxx5DgnvW8LTTIZzM3a6dTuqcIEs';
const STATUS_URL = 'https://xmewmjzaeltegqsvzrqh.supabase.co/functions/v1/print-tracker?action=store_status&store=' + STORE_KEY;
// Standing orders with a permanent printout: shown faded so one-off orders stand out. (Duckweed changes, so it isn't one.)
const STANDING = ['vertical ventures', 'golden isle'];
const REFRESH_MS = 5 * 60 * 1000;
const ICON = { printed: '✅', waiting: '🖨️', late: '⏰', upcoming: '' };

let events = [];
let currentMonth = new Date(); currentMonth.setDate(1);
let view = window.innerWidth <= 700 ? 'next' : 'month';

const dayKey = (d) => d.toLocaleDateString('en-CA');
const timeOf = (ev) => ev.allDay ? 'All day' : ev.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const shortTime = (ev) => ev.allDay ? '' : ev.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();
const isStanding = (ev) => STANDING.some((p) => ev.title.toLowerCase().startsWith(p));

async function load() {
  const now = new Date();
  const tMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
  const tMax = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${API_KEY}&timeMin=${tMin}&timeMax=${tMax}&singleEvents=true&orderBy=startTime&maxResults=500&supportsAttachments=true`;
  try {
    const [calRes, statusRes] = await Promise.all([fetch(url), fetch(STATUS_URL).catch(() => null)]);
    if (!calRes.ok) throw new Error('calendar ' + calRes.status);
    const items = (await calRes.json()).items || [];
    let statuses = [];
    try { statuses = statusRes && statusRes.ok ? (await statusRes.json()).orders || [] : []; } catch (_) {}
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    // Repeating orders can carry a different ID, so fall back to same start time + same name.
    const byTime = new Map(statuses.map((s) => [new Date(s.start).getTime() + '|' + s.summary, s]));
    events = items.map((e) => {
      const allDay = !!e.start?.date && !e.start?.dateTime;
      const date = new Date(allDay ? e.start.date + 'T00:00:00' : e.start.dateTime);
      const title = (e.summary || 'Untitled order').trim();
      const printout = (e.attachments || []).find((a) => a.fileUrl)?.fileUrl || '';
      const st = byKey.get(e.id) || byTime.get(date.getTime() + '|' + title) || null;
      return { title, date, allDay, description: e.description || '', printout, status: st };
    });
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    render();
  } catch (err) {
    document.getElementById('loading').textContent = 'Could not load the calendar. It will try again in a few minutes.';
  }
}

function switchView(v) { view = v; render(); }
function render() {
  for (const v of ['next', 'month', 'list']) {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
    document.getElementById('btn-' + v).classList.toggle('active', v === view);
  }
  if (view === 'next') renderNext(); else if (view === 'month') renderMonth(); else renderList();
}
const eventsOn = (d) => events.filter((e) => dayKey(e.date) === dayKey(d)).sort((a, b) => a.date - b.date);

// One order as a row: time, name, print status, and buttons.
function rowHtml(ev) {
  const st = ev.status;
  // "Print list 2 days before" only makes sense for orders further out than that.
  const soon = ev.date < new Date(new Date().setHours(0, 0, 0, 0) + 3 * 864e5);
  const label = st && st.status === 'upcoming' && soon ? 'Not marked printed' : st && st.label;
  const statusHtml = st ? `<span class="status ${st.status}">${ICON[st.status] ? ICON[st.status] + ' ' : ''}${esc(label)}</span>`
                        : (isStanding(ev) ? '<span class="status upcoming">Standing order</span>' : '');
  const btns = [
    ev.printout ? `<a class="btn primary" href="${esc(ev.printout)}" target="_blank" rel="noopener">📄 Printout</a>` : '',
    st && st.status !== 'printed' ? `<a class="btn" href="${esc(st.mark_url)}" target="_blank" rel="noopener">✅ Mark printed</a>` : '',
  ].join('');
  return `<div class="row${isStanding(ev) ? ' standing' : ''}">
    <div class="time">${timeOf(ev)}</div>
    <div class="name">${esc(ev.title)}${!ev.printout ? '<small>No printout attached</small>' : ''}</div>
    ${statusHtml}
    ${btns ? `<div class="actions">${btns}</div>` : ''}
  </div>`;
}
function dayBlock(d, label) {
  const evs = eventsOn(d);
  const title = label || d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return `<div class="day-block"><div class="day-title">${title} <span class="count">· ${evs.length} ${evs.length === 1 ? 'order' : 'orders'}</span></div>
    ${evs.length ? evs.map(rowHtml).join('') : '<div class="empty">No catering orders</div>'}</div>`;
}

function renderNext() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = [0, 1, 2].map((n) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
  document.getElementById('view-next').innerHTML = days.map((d, i) =>
    dayBlock(d, i === 0 ? 'Today · ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
             : i === 1 ? 'Tomorrow · ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '')).join('');
}

function chipHtml(ev, idx) {
  const st = ev.status ? 's-' + ev.status.status : '';
  const icon = ev.status && ICON[ev.status.status] ? ICON[ev.status.status] + ' ' : (ev.printout ? '📄 ' : '');
  return `<div class="chip ${st}${isStanding(ev) ? ' standing' : ''}" onclick="openOrder(event, ${idx})" title="${esc(timeOf(ev) + ' — ' + ev.title)}"><span class="t">${shortTime(ev)}</span>${icon}${esc(ev.title)}</div>`;
}
function renderMonth() {
  const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
  document.getElementById('monthLabel').textContent = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1).getDay(), total = Math.ceil((first + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  const today = dayKey(new Date()), small = window.innerWidth <= 700, max = small ? 2 : 3;
  let html = '';
  for (let i = 0; i < total; i++) {
    const d = new Date(y, m, 1 - first + i), evs = eventsOn(d);
    html += `<div class="day-cell${d.getMonth() !== m ? ' other-month' : ''}${dayKey(d) === today ? ' today' : ''}" onclick="openDay('${dayKey(d)}')">
      <div class="day-num">${d.getDate()}</div>
      ${evs.slice(0, max).map((ev) => chipHtml(ev, events.indexOf(ev))).join('')}
      ${evs.length > max ? `<div class="more">+${evs.length - max} more</div>` : ''}</div>`;
  }
  document.getElementById('daysGrid').innerHTML = html;
}
function changeMonth(n) { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + n, 1); renderMonth(); }

function renderList() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = [...new Set(events.filter((e) => e.date >= t).map((e) => dayKey(e.date)))];
  document.getElementById('view-list').innerHTML = days.length
    ? days.map((k) => dayBlock(new Date(k + 'T12:00:00'))).join('') : '<div class="empty">No upcoming catering orders</div>';
}

// Tapping an order: open its printout straight away; without one, show the details.
function openOrder(e, idx) {
  e.stopPropagation();
  const ev = events[idx]; if (!ev) return;
  if (ev.printout) { window.open(ev.printout, '_blank', 'noopener'); return; }
  showModal(`<h3>${esc(ev.title)}</h3>${rowHtml(ev)}${ev.description ? `<div class="modal-desc">${esc(ev.description)}</div>` : ''}`);
}
// Tapping a day (or "+ more"): every order that day, with status and buttons.
function openDay(k) { showModal(dayBlock(new Date(k + 'T12:00:00'))); }
function showModal(html) { document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

load();
setInterval(load, REFRESH_MS);
