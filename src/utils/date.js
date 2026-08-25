const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function toLocalIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDateTime(value) {
  if (!value) return new Date();
  const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function formatDate(value, format = 'long-id') {
  const date = parseDateTime(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  if (format === 'dd/mm/yyyy') return `${day}/${month}/${year}`;
  if (format === 'dd-mm-yyyy') return `${day}-${month}-${year}`;
  if (format === 'long-en') {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
  }
  return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${year}`;
}

export function formatTime(value, format = '24-seconds', showTimeZone = true, timeZone = null) {
  const date = parseDateTime(value);
  const options = format === '12-hour'
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', second: format === '24-seconds' ? '2-digit' : undefined, hour12: false };
  let output = new Intl.DateTimeFormat(format === '12-hour' ? 'en-US' : 'id-ID', options).format(date);
  if (showTimeZone) output += ` ${getTimeZoneLabel(date, timeZone)}`;
  return output;
}

export function getTimeZoneLabel(date = new Date(), timeZone = null) {
  if (timeZone && !timeZone.includes('/')) return timeZone;
  let parts;
  try { parts = new Intl.DateTimeFormat('id-ID', { timeZone: timeZone || undefined, timeZoneName: 'short' }).formatToParts(date); }
  catch { return timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'; }
  const label = parts.find((part) => part.type === 'timeZoneName')?.value;
  return label || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
}

export function formatRelative(value) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60000));
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function combineDateAndTime(datePart, timePart) {
  const time = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${datePart}T${time}`;
}

export function dateInputValue(value) {
  return toLocalIso(parseDateTime(value)).slice(0, 10);
}

export function timeInputValue(value) {
  return toLocalIso(parseDateTime(value)).slice(11, 19);
}
