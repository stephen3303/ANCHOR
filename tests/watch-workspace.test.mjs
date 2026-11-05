import test from 'node:test';
import assert from 'node:assert/strict';
import { actionDeadline, issueThreads, watchActions, changesInWindow, deadlineState, remaining, turnoverPackage } from '../src/lib/watch-workspace.ts';
const HOUR = 3_600_000;
const end = Date.parse('2026-10-24T19:00:00Z');
const start = end - 4 * HOUR;
const message = (id, patch = {}) => ({ id, reference: id, subject: `Subject ${id}`, received: new Date(end - HOUR).toISOString(), source: 'FLEET', lifecycle: 'ACTIVE', ackRequired: false, sections: [{ heading: 'Action', body: ['Submit the readiness report.'] }], related: [], ...patch });
const task = (id, patch = {}) => message(id, { actionItem: { text: 'Submit report', suspense: '25 OCT 2026', assignedTo: 'Operations' }, ...patch });

test('quiet received period does not discard older overdue tasks', () => {
  const old = task('old', { received: new Date(start - 48 * HOUR).toISOString(), actionItem: { text: 'Submit report', suspense: '23 OCT 2026', assignedTo: 'Operations' } });
  const result = watchActions([old], {}, {}, start, end, 'OWN');
  assert.equal(result[0].carryover, true);
  assert.equal(deadlineState(result, end).overdue.length, 1);
});

test('busy watch sorts overdue, approaching and no-deadline tasks independently of precedence', () => {
  const rows = watchActions([
    task('unknown', { precedence: 'FLASH', actionItem: { text: 'Review', suspense: '', assignedTo: '' } }),
    task('tomorrow'),
    task('overdue', { actionItem: { text: 'Report', suspense: '23 OCT 2026', assignedTo: 'Owner' } }),
  ], {}, {}, start, end, 'OWN');
  assert.deepEqual(rows.map(a => a.message.id), ['overdue', 'tomorrow', 'unknown']);
  assert.equal(rows[2].owner, 'Unassigned');
  assert.equal(rows[2].due, null);
  assert.equal(remaining(rows[2].due, end), 'No deadline recorded');
});

test('acknowledging or reading never completes the substantive task', () => {
  const m = task('both', { ackRequired: true, ackDue: new Date(end + HOUR).toISOString() });
  assert.equal(watchActions([m], {}, {}, start, end, 'OWN').length, 2);
  const rows = watchActions([m], { both: { read: 'read', acknowledgedAt: new Date(end).toISOString() } }, {}, start, end, 'OWN');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'Task');
  assert.equal(rows[0].status, 'Open');
});

test('only explicit task updates report completion and retain separate history', () => {
  const m = task('t', { ackRequired: true });
  const update = { status: 'Complete', note: 'Report delivered; confirmation pending', at: new Date(end).toISOString(), by: 'Watch officer' };
  const rows = watchActions([m], {}, { 't:task': [update] }, start, end, 'OWN');
  assert.equal(rows.find(a => a.kind === 'Task').status, 'Complete');
  assert.deepEqual(rows.find(a => a.kind === 'Task').history, [update]);
  assert.equal(rows.find(a => a.kind === 'Acknowledgement').status, 'Open');
});

test('inactive and future traffic do not create current requirements', () => {
  const rows = watchActions(['SUPERSEDED','CANCELLED','EXPIRED'].map(lifecycle => task(lifecycle, { lifecycle })).concat(task('future', { received: new Date(end + 1).toISOString() })), {}, {}, start, end, 'OWN');
  assert.equal(rows.length, 0);
});

test('changes expose supported earlier versions and mark missing links for review', () => {
  const previous = task('old', { reference: 'OLD', received: new Date(start - HOUR).toISOString(), lifecycle: 'SUPERSEDED' });
  const corrected = task('new', { lifecycle: 'CORRECTED', relatesTo: 'OLD', sections: [{ heading: 'Action', body: ['Use revised controls.'] }], actionItem: { text: 'Controls', suspense: '26 OCT 2026', assignedTo: 'IT' } });
  const unknown = task('unknown', { lifecycle: 'AMENDED', relatesTo: 'MISSING' });
  const changes = changesInWindow([previous, corrected, unknown], start, end);
  assert.equal(changes[0].previous.id, 'old');
  assert.equal(changes[0].deadlineChanged, true);
  assert.match(changes[0].explanation, /differs/);
  assert.equal(changes[1].previous, undefined);
  assert.match(changes[1].explanation, /unavailable/);
});

test('date-only suspenses use UTC day end; invalid dates and ambiguous timestamps stay unknown', () => {
  assert.equal(actionDeadline('25 OCT 2026').due, Date.parse('2026-10-25T23:59:59Z'));
  for (const invalid of ['31 FEB 2026', '10 XYZ 2026', '2026-10-25', '2026-10-25T12:00:00', undefined]) assert.equal(actionDeadline(invalid).due, null);
});

test('deadline coverage distinguishes no recorded deadlines from none due, including exact 24h boundary', () => {
  const unknown = watchActions([task('u', { actionItem: { text: 'Review', suspense: '', assignedTo: '' } })], {}, {}, start, end, 'OWN');
  assert.match(deadlineState(unknown, end).message, /No deadlines recorded/);
  const future = watchActions([task('f', { actionItem: { text: 'Review', suspense: '30 OCT 2026', assignedTo: 'Owner' } })], {}, {}, start, end, 'OWN');
  assert.match(deadlineState(future, end).message, /No recorded deadlines due/);
  const exact = message('boundary', { ackRequired: true, ackDue: new Date(end + 24 * HOUR).toISOString() });
  assert.equal(deadlineState(watchActions([exact], {}, {}, start, end, 'OWN'), end).next24.length, 1);
});

test('offline exports disclose stale sync, unknown ingest, reporting and generation times, and older carryover', () => {
  const old = task('old', { received: new Date(start - HOUR).toISOString() });
  const actions = watchActions([old], {}, {}, start, end, 'OWN');
  const result = turnoverPackage({ start, end, generatedAt: '2026-11-05T12:00:00Z', refreshedAt: null, offline: true, lastSync: '2026-10-21T18:00:00Z', pendingSync: 3, messages: [], actions, issues: [], notes: ['Confirm communications'], checklist: { Reviewed: false } });
  assert.equal(result.carryover.length, 1);
  assert.equal(result.traffic.length, 0);
  assert.equal(result.freshness.lastSuccessfulIngest, null);
  assert.equal(result.freshness.pendingSync, 3);
  assert.match(result.freshness.connection, /Offline/);
  assert.equal(result.generatedAt, '2026-11-05T12:00:00Z');
  assert.equal(result.reportingWindow.end, new Date(end).toISOString());
});

test('issue threads use explicit references, not similar subjects', () => {
  const old = message('old', { reference: 'OLD' });
  const corrected = message('new', { relatesTo: 'OLD' });
  const unrelated = message('separate', { subject: corrected.subject });
  const [thread] = issueThreads([old, corrected, unrelated]);
  assert.deepEqual(thread.map(m => m.id).sort(), ['new', 'old']);
});
