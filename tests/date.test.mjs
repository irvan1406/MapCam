import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatTime, combineDateAndTime } from '../src/utils/date.js';

test('Indonesian date formats are deterministic', () => {
  const value = '2026-08-20T05:50:32';
  assert.equal(formatDate(value, 'dd/mm/yyyy'), '20/08/2026');
  assert.equal(formatDate(value, 'dd-mm-yyyy'), '20-08-2026');
  assert.equal(formatDate(value, 'long-id'), '20 Agustus 2026');
  assert.match(formatTime(value, '24-seconds', false), /05[.:]50[.:]32/);
  assert.match(formatTime(value, '24-seconds', true, 'WIB'), /WIB$/);
});

test('date and time inputs combine with seconds', () => {
  assert.equal(combineDateAndTime('2026-08-20', '05:50'), '2026-08-20T05:50:00');
});
