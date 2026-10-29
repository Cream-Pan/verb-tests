const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../protocol.js');
const makeConfig = (order, gapSeconds = 60) => ({ order, gapSeconds, stimuli: P.defaultStimuli(), participantId: 'P001' });
const origin = Date.parse('2026-10-29T00:00:00Z');

test('four protocols preserve durations, generation exposure, rest and repetition', () => {
  const expected = {
    vf_original: [360000, 90000, 90000, 180000, 24],
    vg_original: [720000, 180000, 180000, 360000, 72],
    vf_revised: [360000, 180000, 0, 180000, 24],
    vg_revised: [360000, 180000, 0, 180000, 36]
  };
  for (const [id, [total, generation, repetition, rest, count]] of Object.entries(expected)) {
    const plan = P.createPlan(makeConfig([id]));
    const sum = type => plan.phases.filter(p => p.type === type).reduce((n,p) => n + p.durationMs, 0);
    assert.equal(plan.plannedDurationMs, total);
    assert.equal(sum('generate'), generation); assert.equal(sum('repeat'), repetition); assert.equal(sum('rest'), rest);
    assert.equal(plan.phases.length, count);
    assert.equal(plan.phases[0].type, 'generate'); assert.equal(plan.phases.at(-1).type, 'rest');
    assert.ok(plan.phases.every(p => p.durationMs === (p.taskFamily === 'verbal_fluency' ? 15000 : p.type === 'rest' ? 30000 : 6000)));
  }
});

test('selected task order and gaps control both plan and task_start events', () => {
  const config = makeConfig(['vg_original','vf_revised','vf_original','vg_revised']);
  const engine = new P.Session(config, origin);
  assert.equal(engine.plan.plannedDurationMs, 33 * 60000);
  engine.start(0);
  while (engine.state === 'running') engine.tick(engine.deadline);
  assert.equal(engine.state, 'completed');
  const starts = engine.events.filter(e => e.event === 'task_start');
  assert.deepEqual(starts.map(e => e.task_id), config.order);
  assert.deepEqual(starts.map(e => e.task_order), [1,2,3,4]);
  assert.deepEqual(starts.map(e => e.elapsed_ms), [0,780000,1200000,1620000]);
  assert.ok(starts.every(e => e.event_label === '課題開始' && e.timestamp_jst.endsWith('+09:00')));
  assert.equal(engine.events.filter(e => e.event === 'task_end').length, 4);
  assert.equal(engine.events.filter(e => e.event === 'session_end').length, 1);
  assert.equal(engine.events.filter(e => e.event === 'phase_start' && e.condition === 'intertask_rest').length, 3);
  assert.equal(engine.completedTasks, 4);
});

test('new protocols total 13 minutes with the default task gap', () => {
  const plan = P.createPlan(makeConfig(['vf_revised','vg_revised']));
  assert.equal(plan.plannedDurationMs, 780000);
  assert.equal(plan.tasks[1].plannedOnsetMs, 420000);
  assert.equal(plan.phases.filter(p => p.condition.includes('repetition')).length, 0);
});

test('zero gaps and a single selected task have no added rest phases', () => {
  for (const order of [['vf_revised'],['vg_revised','vf_revised']]) {
    const engine = new P.Session(makeConfig(order, 0), origin);
    engine.start(0); while (engine.state === 'running') engine.tick(engine.deadline);
    assert.equal(engine.plan.phases.filter(p => p.type === 'intertask_rest').length, 0);
    assert.equal(engine.events.filter(e => e.event === 'task_start').length, order.length);
    assert.equal(engine.endMs, order.length * 360000);
  }
});

test('pause/resume preserves remaining exposure and separates active from wall time', () => {
  const engine = new P.Session(makeConfig(['vf_revised']), origin);
  engine.start(100); engine.pause(5100, 'hidden');
  assert.equal(engine.remainingMs, 10000);
  engine.tick(21000); assert.equal(engine.index, 0);
  engine.resume(35100); assert.equal(engine.deadline, 45100);
  engine.tick(45100);
  const end = engine.events.find(e => e.event === 'phase_end');
  assert.equal(end.actual_duration_ms, 15000); assert.equal(end.wall_duration_ms, 45000); assert.equal(end.interrupted, true);
  assert.equal(end.elapsed_ms, 45000); assert.equal(end.active_elapsed_ms, 15000);
  assert.equal(engine.events.filter(e => e.event === 'task_start').length, 1);
  while (engine.state === 'running') engine.tick(engine.deadline);
  assert.equal(engine.endMs, 390100);
});

test('abort while paused records only shown tasks and the incomplete phase', () => {
  const engine = new P.Session(makeConfig(['vg_revised','vf_original']), origin);
  engine.start(0); engine.pause(2000); engine.abort(5000);
  assert.equal(engine.state, 'aborted'); assert.equal(engine.events.at(-1).event, 'session_abort');
  assert.equal(engine.events.filter(e => e.event === 'task_start').length, 1);
  assert.equal(engine.events.filter(e => e.event === 'task_abort').length, 1);
  assert.equal(engine.events.find(e => e.event === 'phase_end').actual_duration_ms, 2000);
  assert.equal(engine.events.at(-1).active_elapsed_ms, 2000);
  assert.equal(engine.events.filter(e => e.event === 'task_end').length, 0);
});

test('a late frame never skips a stimulus and reports the observed delay', () => {
  const engine = new P.Session(makeConfig(['vg_revised']), origin);
  engine.start(0); engine.tick(18000);
  assert.equal(engine.index, 1); assert.equal(engine.active.stimulus, 'ボール'); assert.equal(engine.deadline, 24000);
  assert.equal(engine.events.find(e => e.event === 'phase_end').overrun_ms, 12000);
  assert.equal(engine.events.filter(e => e.event === 'phase_start')[1].onset_delay_ms, 12000);
});

test('stimuli validation rejects malformed lists and stores independent copies', () => {
  assert.throws(() => P.createPlan(makeConfig([])));
  assert.throws(() => P.createPlan(makeConfig(['vf_original','vf_original'])));
  const config = makeConfig(['vf_revised']); config.stimuli.vf_revised.letters.pop();
  assert.throws(() => P.createPlan(config));
  const nounConfig = makeConfig(['vg_revised']); nounConfig.stimuli.vg_revised.generation[0].pop();
  assert.throws(() => P.createPlan(nounConfig));
  const source = makeConfig(['vg_original']); const engine = new P.Session(source, origin);
  source.stimuli.vg_original.generation[0][0] = '変更';
  assert.equal(engine.plan.phases[0].stimulus, 'りんご');
});

test('event CSV contains task-start markers, Japanese names, dates and Excel-safe strings', () => {
  const config = makeConfig(['vf_revised']); config.participantId = '=1+1'; config.note = '引用"と,カンマ\n改行';
  const engine = new P.Session(config, origin); engine.start(0);
  const output = P.csv(engine.events);
  assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('"task_start"')); assert.ok(output.includes('"言語流暢性課題（改）"'));
  assert.ok(output.includes('"2026-10-29T09:00:00.000+09:00"'));
  assert.ok(output.includes('"\'=1+1"')); assert.ok(output.includes('引用""と,カンマ\n改行'));
});
