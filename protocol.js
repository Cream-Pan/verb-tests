(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LanguageTasks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const GENERATION = [
    ['りんご', 'ボール', '自転車', 'はさみ', 'コップ'],
    ['傘', '鉛筆', '時計', 'ドア', '鍵'],
    ['手紙', '車', 'カメラ', '電車', '太鼓'],
    ['ほうき', '石鹸', '布団', '歯ブラシ', '枕'],
    ['卵', '野菜', 'お茶', 'パン', 'ケーキ'],
    ['パソコン', 'スマホ', 'テレビ', '電気', 'ラジオ']
  ];
  const CONTROL = [
    ['みかん', 'かばん', '電話', '靴', '椅子'],
    ['ノート', 'タオル', '皿', 'くし', '窓'],
    ['本', '飛行機', '船', 'ギター', '服'],
    ['雑巾', 'じょうろ', '袋', 'タンス', '靴下'],
    ['ご飯', '魚', '水', 'コーヒー', '肉'],
    ['リモコン', '写真', '電池', '地図', '扉']
  ];
  const TASKS = Object.freeze({
    vf_original: { id: 'vf_original', name: '言語流暢性課題', family: 'verbal_fluency', version: 'original', short: '言語流暢性', cycles: 6, durationMs: 360000, generationMs: 90000, description: '単語生成 15 秒 → 休憩 15 秒 →「ぱぬ」の反復 15 秒 → 休憩 15 秒', accent: 'violet' },
    vg_original: { id: 'vg_original', name: '動詞生成課題', family: 'verb_generation', version: 'original', short: '動詞生成', cycles: 6, durationMs: 720000, generationMs: 180000, description: '動詞生成 30 秒 → 休憩 30 秒 → 名詞反復 30 秒 → 休憩 30 秒', accent: 'blue' },
    vf_revised: { id: 'vf_revised', name: '言語流暢性課題（改）', family: 'verbal_fluency', version: 'revised', short: '言語流暢性（改）', cycles: 12, durationMs: 360000, generationMs: 180000, description: '単語生成 15 秒 → 休憩 15 秒', accent: 'violet' },
    vg_revised: { id: 'vg_revised', name: '動詞生成課題（改）', family: 'verb_generation', version: 'revised', short: '動詞生成（改）', cycles: 6, durationMs: 360000, generationMs: 180000, description: '動詞生成 30 秒 → 休憩 30 秒', accent: 'blue' }
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  function defaultStimuli() {
    return {
      vf_original: { letters: ['あ', 'か', 'き', 'さ', 'た', 'は'], nonword: 'ぱぬ' },
      vf_revised: { letters: ['あ', 'か', 'き', 'さ', 'た', 'は', 'な', 'ま', 'や', 'ら', 'み', 'こ'] },
      vg_original: { generation: clone(GENERATION), control: clone(CONTROL) },
      vg_revised: { generation: clone(GENERATION) }
    };
  }
  function validate(config) {
    if (!Array.isArray(config.order) || !config.order.length) throw new Error('実行する課題を 1 つ以上選択してください．');
    if (new Set(config.order).size !== config.order.length || config.order.some(id => !TASKS[id])) throw new Error('課題の選択に誤りがあります．');
    if (!Number.isInteger(config.gapSeconds) || config.gapSeconds < 0 || config.gapSeconds > 600) throw new Error('課題間の休憩は 0〜600 秒の整数で設定してください．');
    for (const id of config.order) {
      const task = TASKS[id], stimuli = config.stimuli?.[id];
      const validWord = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 40;
      if (task.family === 'verbal_fluency') {
        if (!stimuli || !Array.isArray(stimuli.letters) || stimuli.letters.length !== task.cycles || stimuli.letters.some(x => !validWord(x) || !/^[ぁ-ゖ]$/u.test(x))) throw new Error(task.name + 'の文字は，ひらがな 1 文字ずつ，' + task.cycles + ' 個設定してください．');
        if (task.version === 'original' && !validWord(stimuli.nonword)) throw new Error('反復する無意味語を入力してください．');
      } else {
        for (const key of task.version === 'original' ? ['generation', 'control'] : ['generation']) {
          if (!stimuli || !Array.isArray(stimuli[key]) || stimuli[key].length !== 6 || stimuli[key].some(row => !Array.isArray(row) || row.length !== 5 || row.some(x => !validWord(x)))) throw new Error(task.name + 'の名詞を，6 行 × 各 5 個で設定してください．');
        }
      }
    }
    return true;
  }
  function createPlan(input) {
    const config = clone(input); validate(config);
    const phases = [], tasks = []; let planned = 0;
    const add = phase => { phases.push({ ...phase, phaseIndex: phases.length + 1, plannedOnsetMs: planned }); planned += phase.durationMs; };
    config.order.forEach((id, taskIndex) => {
      const task = TASKS[id], s = config.stimuli[id], onset = planned;
      const base = { taskId: id, taskName: task.name, taskOrder: taskIndex + 1, taskFamily: task.family, protocolVersion: task.version, taskCycles: task.cycles };
      for (let cycle = 1; cycle <= task.cycles; cycle++) {
        const context = { ...base, cycle };
        if (task.family === 'verbal_fluency') {
          add({ ...context, type: 'generate', condition: 'word_generation', stimulus: s.letters[cycle - 1], stimulusIndex: 1, durationMs: 15000 });
          add({ ...context, type: 'rest', condition: 'rest', stimulus: '＋', durationMs: 15000 });
          if (task.version === 'original') {
            add({ ...context, type: 'repeat', condition: 'nonword_repetition', stimulus: s.nonword, stimulusIndex: 1, durationMs: 15000 });
            add({ ...context, type: 'rest', condition: 'rest', stimulus: '＋', durationMs: 15000 });
          }
        } else {
          s.generation[cycle - 1].forEach((word, index) => add({ ...context, type: 'generate', condition: 'verb_generation', stimulus: word, stimulusIndex: index + 1, durationMs: 6000 }));
          add({ ...context, type: 'rest', condition: 'rest', stimulus: '＋', durationMs: 30000 });
          if (task.version === 'original') {
            s.control[cycle - 1].forEach((word, index) => add({ ...context, type: 'repeat', condition: 'noun_repetition', stimulus: word, stimulusIndex: index + 1, durationMs: 6000 }));
            add({ ...context, type: 'rest', condition: 'rest', stimulus: '＋', durationMs: 30000 });
          }
        }
      }
      tasks.push({ ...base, plannedOnsetMs: onset, durationMs: planned - onset });
      if (taskIndex < config.order.length - 1 && config.gapSeconds > 0) add({ type: 'intertask_rest', condition: 'intertask_rest', stimulus: '＋', durationMs: config.gapSeconds * 1000, nextTaskId: config.order[taskIndex + 1], nextTaskName: TASKS[config.order[taskIndex + 1]].name });
    });
    return { phases, tasks, plannedDurationMs: planned };
  }
  const EVENT_LABELS = { session_start: 'セッション開始', session_end: 'セッション終了', session_abort: 'セッション中止', task_start: '課題開始', task_end: '課題終了', task_abort: '課題中止', phase_start: '区間開始', phase_end: '区間終了', pause: '一時停止', resume: '再開' };
  class Session {
    constructor(config, origin, onChange = () => {}, id = '') {
      this.config = clone(config); this.plan = createPlan(this.config); this.origin = origin; this.onChange = onChange;
      this.id = id || 'LANG-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17) + '-' + Math.random().toString(36).slice(2, 7);
      this.events = []; this.index = -1; this.state = 'ready'; this.pausedMs = 0; this.phasePausedMs = 0; this.active = null; this.startMs = null; this.endMs = null; this.taskPausedMs = 0; this.completedTasks = 0;
    }
    timestamp(now) { return new Date(this.origin + now).toISOString(); }
    elapsed(now) { return this.startMs === null ? 0 : now - this.startMs; }
    activeElapsed(now) { return this.startMs === null ? 0 : (this.state === 'paused' ? this.pauseMs : now) - this.startMs - this.pausedMs; }
    event(type, now, extra = {}) {
      const p = this.active || {};
      const unix = this.origin + now;
      this.events.push({ session_id: this.id, participant_id: this.config.participantId || '', session_note: this.config.note || '', app_version: VERSION, event_index: this.events.length + 1, event: type, event_label: EVENT_LABELS[type] || type, timestamp: this.timestamp(now), timestamp_jst: new Date(unix + 9 * 3600000).toISOString().replace('Z', '+09:00'), timestamp_unix_ms: Math.round(unix), wall_clock_unix_ms: Date.now(), elapsed_ms: +this.elapsed(now).toFixed(3), active_elapsed_ms: +this.activeElapsed(now).toFixed(3), task_id: p.taskId || '', task_name: p.taskName || '', task_family: p.taskFamily || '', protocol_version: p.protocolVersion || '', task_order: p.taskOrder || '', cycle: p.cycle || '', condition: p.condition || '', phase_index: p.phaseIndex || '', stimulus_index: p.stimulusIndex || '', stimulus: p.stimulus || '', planned_onset_ms: p.plannedOnsetMs ?? '', planned_duration_ms: p.durationMs ?? '', ...extra });
    }
    start(now) {
      if (this.state !== 'ready') return;
      this.startMs = now; this.state = 'running'; this.event('session_start', now); this.enter(0, now);
    }
    enter(index, now) {
      if (index >= this.plan.phases.length) {
        this.active = null; this.state = 'completed'; this.endMs = now; this.event('session_end', now); this.onChange('end'); return;
      }
      const previous = this.active;
      this.index = index; this.active = this.plan.phases[index]; this.phaseStart = now; this.phasePausedMs = 0; this.phaseInterrupted = false; this.deadline = now + this.active.durationMs;
      const p = this.active;
      if (p.taskId && p.taskId !== previous?.taskId) {
        this.taskStart = now; this.taskPausedMs = 0;
        this.event('task_start', now, { planned_duration_ms: TASKS[p.taskId].durationMs, onset_delay_ms: +(this.activeElapsed(now) - p.plannedOnsetMs).toFixed(3) });
      }
      this.event('phase_start', now, { onset_delay_ms: +(this.activeElapsed(now) - p.plannedOnsetMs).toFixed(3), next_task_id: p.nextTaskId || '' });
      this.onChange('phase');
    }
    closePhase(now, aborted = false) {
      if (!this.active) return;
      const duration = now - this.phaseStart - this.phasePausedMs;
      this.event('phase_end', now, { actual_duration_ms: +duration.toFixed(3), wall_duration_ms: +(now - this.phaseStart).toFixed(3), overrun_ms: +(duration - this.active.durationMs).toFixed(3), interrupted: this.phaseInterrupted, aborted });
      const next = this.plan.phases[this.index + 1];
      if (this.active.taskId && (aborted || !next || next.taskId !== this.active.taskId)) {
        this.event(aborted ? 'task_abort' : 'task_end', now, { actual_duration_ms: +(now - this.taskStart - this.taskPausedMs).toFixed(3), planned_duration_ms: TASKS[this.active.taskId].durationMs });
        if (!aborted) this.completedTasks++;
      }
    }
    tick(now) {
      if (this.state !== 'running') return;
      // Never skip stimuli to catch up after a delayed frame. Log the actual transition.
      if (now >= this.deadline) { this.closePhase(now); this.enter(this.index + 1, now); }
    }
    pause(now, reason = 'manual') {
      if (this.state !== 'running') return;
      this.remainingMs = Math.max(0, this.deadline - now); this.pauseMs = now; this.state = 'paused'; this.phaseInterrupted = true;
      this.event('pause', now, { reason }); this.onChange('pause');
    }
    resume(now) {
      if (this.state !== 'paused') return;
      const duration = now - this.pauseMs; this.pausedMs += duration; this.phasePausedMs += duration; this.taskPausedMs += duration;
      this.deadline = now + this.remainingMs; this.state = 'running'; this.event('resume', now, { pause_duration_ms: +duration.toFixed(3) }); this.onChange('resume');
    }
    abort(now) {
      if (!['running', 'paused'].includes(this.state)) return;
      if (this.state === 'paused') { const duration = now - this.pauseMs; this.pausedMs += duration; this.phasePausedMs += duration; this.taskPausedMs += duration; }
      this.state = 'aborted'; this.closePhase(now, true); this.endMs = now; this.event('session_abort', now); this.active = null; this.onChange('end');
    }
    snapshot() {
      return { app_version: VERSION, session_id: this.id, config: clone(this.config), state: this.state, time_origin_unix_ms: this.origin, started_at: this.startMs === null ? null : this.timestamp(this.startMs), ended_at: this.endMs === null ? null : this.timestamp(this.endMs), paused_total_ms: this.pausedMs, completed_tasks: this.completedTasks, planned_duration_ms: this.plan.plannedDurationMs, tasks: clone(this.plan.tasks), presentation_plan: clone(this.plan.phases), events: clone(this.events) };
    }
  }
  const COLUMNS = ['session_id','participant_id','session_note','app_version','event_index','event','event_label','timestamp','timestamp_jst','timestamp_unix_ms','wall_clock_unix_ms','elapsed_ms','active_elapsed_ms','task_order','task_id','task_name','task_family','protocol_version','cycle','condition','phase_index','stimulus_index','stimulus','planned_onset_ms','planned_duration_ms','onset_delay_ms','actual_duration_ms','wall_duration_ms','overrun_ms','interrupted','aborted','reason','pause_duration_ms','next_task_id'];
  function csv(rows, columns = COLUMNS) {
    const cell = value => {
      let text = value === null || value === undefined ? '' : String(value);
      if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
  }
  return { VERSION, TASKS, defaultStimuli, validate, createPlan, Session, csv, clone, COLUMNS };
});
