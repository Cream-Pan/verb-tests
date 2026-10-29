(() => {
  'use strict';
  const { TASKS, VERSION, defaultStimuli, validate, createPlan, Session, csv, clone } = LanguageTasks;
  const $ = id => document.getElementById(id);
  const SETTINGS_KEY = 'language-task-runner-settings-v1', RECORD_KEY = 'language-task-runner-record-v1';
  const initialOrder = ['vf_revised', 'vg_revised', 'vf_original', 'vg_original'];
  let order = [...initialOrder], selected = new Set(['vf_revised', 'vg_revised']), stimuli = defaultStimuli();
  let engine = null, report = null, cached = null, editorId = null, animation = 0, lastFrame = null, toastTimer = null, storageWarned = false, fullscreenUsed = false;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = id => '<svg aria-hidden="true"><use href="#icon-' + id + '"/></svg>';
  const formatTime = ms => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  const timeJst = timestamp => timestamp ? new Date(Date.parse(timestamp) + 9 * 3600000).toISOString().replace('T', ' ').replace('Z', '').slice(0, 23) : '—';
  const readStorage = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500); }
  function saveStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { if (!storageWarned) { storageWarned = true; toast('端末内に保存できません．終了後，必ず記録をダウンロードしてください．'); } return false; }
  }
  function config() {
    return { order: order.filter(id => selected.has(id)), gapSeconds: Number($('gap-seconds').value), participantId: $('participant-id').value.trim(), note: $('session-note').value.trim(), fullscreen: $('fullscreen').checked, showTimer: $('show-timer').checked, stimuli: clone(stimuli) };
  }
  function saveSettings() { saveStorage(SETTINGS_KEY, { order, selected: [...selected], ...config(), allOrder: order }); }
  const saved = readStorage(SETTINGS_KEY);
  if (saved) {
    try {
      if (Array.isArray(saved.allOrder) && saved.allOrder.length === 4 && new Set(saved.allOrder).size === 4 && saved.allOrder.every(id => TASKS[id])) order = saved.allOrder;
      if (Array.isArray(saved.selected)) selected = new Set(saved.selected.filter(id => TASKS[id]));
      if (saved.stimuli) { for (const id of initialOrder) { const candidate = { order: [id], gapSeconds: 60, stimuli: saved.stimuli }; try { validate(candidate); stimuli[id] = saved.stimuli[id]; } catch {} } }
      if (Number.isInteger(saved.gapSeconds) && saved.gapSeconds >= 0 && saved.gapSeconds <= 600) $('gap-seconds').value = saved.gapSeconds;
      $('participant-id').value = typeof saved.participantId === 'string' ? saved.participantId.slice(0, 80) : '';
      $('session-note').value = typeof saved.note === 'string' ? saved.note.slice(0, 160) : '';
      $('fullscreen').checked = saved.fullscreen !== false; $('show-timer').checked = saved.showTimer === true;
    } catch { order = [...initialOrder]; selected = new Set(['vf_revised','vg_revised']); stimuli = defaultStimuli(); }
  }
  function flowMarkup(task) {
    const seconds = task.family === 'verbal_fluency' ? 15 : 30;
    const first = task.family === 'verbal_fluency' ? '単語生成' : '動詞生成';
    const pieces = [[first + ' ' + seconds + ' 秒', true], ['休憩 ' + seconds + ' 秒', false]];
    if (task.version === 'original') pieces.push([task.family === 'verbal_fluency' ? stimuli[task.id].nonword + '反復 15 秒' : '名詞反復 30 秒', false], ['休憩 ' + seconds + ' 秒', false]);
    return pieces.map(([text, generate], index) => (index ? '<span class="flow-separator">→</span>' : '') + '<span class="flow-piece ' + (generate ? 'generate' : '') + '">' + escape(text) + '</span>').join('');
  }
  function renderTasks(focusId) {
    const chosen = order.filter(id => selected.has(id));
    $('task-list').innerHTML = order.map((id, index) => {
      const task = TASKS[id], isSelected = selected.has(id);
      return '<article class="task-card ' + task.accent + (isSelected ? ' selected' : '') + '"><label class="task-select"><input type="checkbox" data-select="' + id + '" aria-label="' + task.name + 'を実行"' + (isSelected ? ' checked' : '') + '></label><div class="task-body"><div class="task-card-top"><span class="task-category">' + (task.family === 'verbal_fluency' ? 'VERBAL FLUENCY' : 'VERB GENERATION') + '</span><span class="task-badges"><span class="tag">' + (task.version === 'revised' ? '反復課題なし' : '反復課題あり') + '</span><span class="tag ' + (task.version === 'revised' ? 'revised' : '') + '">' + (task.version === 'revised' ? '改訂版' : '旧版') + '</span></span></div><h3>' + task.name + '</h3><div class="task-flow">' + flowMarkup(task) + '</div><div class="task-card-bottom"><div class="task-metrics"><b>' + task.durationMs / 60000 + ' 分</b><span class="divider"></span><span>' + task.cycles + ' セット</span><span class="divider"></span><span>生成 ' + task.generationMs / 1000 + ' 秒</span></div><button class="text-button task-details" data-details="' + id + '">刺激・構成 ↗</button></div></div><div class="reorder-controls"><button data-move="' + id + '" data-direction="-1" aria-label="' + task.name + 'を上へ"' + (index === 0 ? ' disabled' : '') + '>' + icon('up') + '</button><span class="order-number">' + (isSelected ? String(chosen.indexOf(id) + 1).padStart(2, '0') : '—') + '</span><button data-move="' + id + '" data-direction="1" aria-label="' + task.name + 'を下へ"' + (index === order.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button></div></article>';
    }).join('');
    $('select-all').textContent = selected.size === 4 ? 'すべて解除' : 'すべて選択';
    if (focusId) document.querySelector(focusId)?.focus();
    updateSummary();
  }
  function updateSummary() {
    const c = config(); let plan;
    try { plan = createPlan(c); $('setup-error').hidden = true; } catch (error) {
      $('setup-error').textContent = error.message; $('setup-error').hidden = false;
    }
    $('prepare-start').disabled = !plan;
    const total = plan?.plannedDurationMs || 0, seconds = Math.round(total / 1000);
    $('total-minutes').textContent = Math.floor(seconds / 60); $('total-seconds').textContent = seconds % 60 ? ' ' + seconds % 60 + ' 秒' : '';
    const gaps = Math.max(0, c.order.length - 1), gapTotal = gaps * (Number.isFinite(c.gapSeconds) ? c.gapSeconds : 0);
    $('duration-description').textContent = c.order.length + ' 課題' + (gapTotal ? ' ＋ 課題間の休憩 ' + (gapTotal % 60 === 0 ? gapTotal / 60 + ' 分' : gapTotal + ' 秒') : ' ／ 課題間の休憩なし');
    const segments = [];
    c.order.forEach((id, index) => { const task = TASKS[id]; segments.push('<div class="timeline-segment ' + task.accent + ' ' + task.version + '" style="flex:' + task.durationMs + '" title="' + task.name + ' ' + task.durationMs / 60000 + ' 分"></div>'); if (index < c.order.length - 1 && c.gapSeconds > 0) segments.push('<div class="timeline-segment gap" style="flex:' + c.gapSeconds * 1000 + '" title="課題間の休憩 ' + c.gapSeconds + ' 秒"></div>'); });
    $('timeline').innerHTML = segments.join('');
    $('timeline-legend').innerHTML = c.order.map((id, index) => { const t = TASKS[id]; return '<div class="legend-item ' + t.accent + ' ' + t.version + '"><span>' + (index + 1) + '. ' + t.name + '</span><span class="legend-duration">' + t.durationMs / 60000 + ' 分</span></div>'; }).join('');
    saveSettings();
  }
  $('task-list').addEventListener('change', event => { const id = event.target.dataset.select; if (!id) return; event.target.checked ? selected.add(id) : selected.delete(id); renderTasks('[data-select="' + id + '"]'); });
  $('task-list').addEventListener('click', event => {
    const move = event.target.closest('[data-move]');
    if (move) { const index = order.indexOf(move.dataset.move), next = index + Number(move.dataset.direction); if (next >= 0 && next < order.length) { [order[index], order[next]] = [order[next], order[index]]; renderTasks('[data-move="' + move.dataset.move + '"][data-direction="' + move.dataset.direction + '"]'); } }
    const details = event.target.closest('[data-details]'); if (details) openEditor(details.dataset.details);
  });
  $('select-all').addEventListener('click', () => { selected = selected.size === 4 ? new Set() : new Set(order); renderTasks(); });
  ['gap-seconds','participant-id','session-note','fullscreen','show-timer'].forEach(id => $(id).addEventListener('input', updateSummary));
  function renderEditor(value) {
    const task = TASKS[editorId];
    $('stimuli-fields').innerHTML = task.family === 'verbal_fluency' ? '<label class="stimuli-label" for="edit-letters">提示するひらがな（' + task.cycles + ' 個）</label><textarea id="edit-letters" class="stimuli-field" spellcheck="false">' + escape(value.letters.join('，')) + '</textarea><p class="stimuli-helper">ひらがな 1 文字ずつ，読点・カンマ・空白・改行で区切ります．提示順は入力順です．</p>' + (task.version === 'original' ? '<label class="stimuli-label" for="edit-nonword">反復する無意味語</label><input id="edit-nonword" class="text-input" maxlength="40" value="' + escape(value.nonword) + '">' : '') : '<label class="stimuli-label" for="edit-generation">動詞生成に使う名詞（6 行 × 各 5 個）</label><textarea id="edit-generation" class="stimuli-field nouns" spellcheck="false">' + escape(value.generation.map(row => row.join('，')).join('\n')) + '</textarea><p class="stimuli-helper">1 行を 1 セットとし，名詞を読点またはカンマで区切ります．各名詞を 6 秒ずつ，入力順で提示します．</p>' + (task.version === 'original' ? '<label class="stimuli-label" for="edit-control">反復課題に使う名詞（6 行 × 各 5 個）</label><textarea id="edit-control" class="stimuli-field nouns" spellcheck="false">' + escape(value.control.map(row => row.join('，')).join('\n')) + '</textarea>' : '');
    $('stimuli-error').hidden = true;
  }
  function openEditor(id) { editorId = id; $('stimuli-title').textContent = TASKS[id].name; $('stimuli-flow').textContent = TASKS[id].description.replace('ぱぬ', stimuli[id].nonword || 'ぱぬ') + ' × ' + TASKS[id].cycles + ' セット'; renderEditor(stimuli[id]); $('stimuli-dialog').showModal(); }
  const splitWords = value => value.trim().split(/[，、,\s]+/u).filter(Boolean);
  $('stimuli-save').addEventListener('click', () => {
    const task = TASKS[editorId]; let value;
    if (task.family === 'verbal_fluency') { value = { letters: splitWords($('edit-letters').value) }; if (task.version === 'original') value.nonword = $('edit-nonword').value.trim(); }
    else { const parse = id => $(id).value.trim().split(/\r?\n/).map(splitWords); value = { generation: parse('edit-generation') }; if (task.version === 'original') value.control = parse('edit-control'); }
    try { validate({ order: [editorId], gapSeconds: 60, stimuli: { [editorId]: value } }); stimuli[editorId] = value; renderTasks(); $('stimuli-dialog').close(); toast('刺激リストを保存しました．'); }
    catch (error) { $('stimuli-error').textContent = error.message; $('stimuli-error').hidden = false; }
  });
  $('stimuli-default').addEventListener('click', () => renderEditor(defaultStimuli()[editorId]));
  $('protocol-open').addEventListener('click', () => $('protocol-dialog').showModal()); $('protocol-close').addEventListener('click', () => $('protocol-dialog').close());
  $('prepare-start').addEventListener('click', () => {
    const c = config(); try { validate(c); } catch (error) { toast(error.message); return; }
    $('instructions-understood').checked = false; $('start-session').disabled = true;
    $('instruction-content').innerHTML = c.order.map((id, index) => {
      const t = TASKS[id], vf = t.family === 'verbal_fluency';
      return '<div class="instruction-item"><h3>' + (index + 1) + '. ' + t.name + ' <span class="tag">' + t.durationMs / 60000 + ' 分</span></h3><p>' + (vf ? 'ひらがなが 1 文字表示されたら，その文字から始まる単語をできるだけ多く頭の中で考えてください．同じ単語の繰り返し，人名・地名は避けてください．' : '名詞が 6 秒ごとに表示されます．その名詞から連想できる動詞を頭の中で考えてください．例えば「りんご」なら「食べる」「むく」「切る」などです．1 つでも複数でも構いません．') + '</p>' + (t.version === 'original' ? '<p class="instruction-extra">反復区間では，' + (vf ? '「' + escape(stimuli[id].nonword) + '」を頭の中で繰り返してください．' : '表示された名詞を頭の中で繰り返してください．動詞は考えないでください．') + '</p>' : '') + '</div>';
    }).join('');
    $('instructions-dialog').showModal();
  });
  $('instructions-back').addEventListener('click', () => $('instructions-dialog').close());
  $('instructions-understood').addEventListener('change', event => $('start-session').disabled = !event.target.checked);
  function showPage(page) { for (const name of ['home','run','results']) $(name + '-page').hidden = page !== name; if (page !== 'run') window.scrollTo(0, 0); }
  async function requestFullscreen() { try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); fullscreenUsed = !!document.fullscreenElement; } catch { fullscreenUsed = false; toast('全画面に切り替えられませんでした．通常表示で続けます．'); } }
  $('start-session').addEventListener('click', async () => {
    if (!$('instructions-understood').checked) return;
    const c = config(); try { validate(c); } catch (error) { toast(error.message); return; }
    $('instructions-dialog').close(); $('start-session').disabled = true; showPage('run');
    fullscreenUsed = false; if (c.fullscreen) await requestFullscreen();
    const origin = Date.now() - performance.now(); engine = new Session(c, origin, onEngineChange);
    requestAnimationFrame(now => { engine.start(now); if (document.hidden || !document.hasFocus()) engine.pause(now, 'focus_lost'); lastFrame = now; animation = requestAnimationFrame(frame); });
  });
  function saveRecord() { if (!engine) return; report = engine.snapshot(); cached = report; saveStorage(RECORD_KEY, report); }
  function onEngineChange(kind) {
    if (kind === 'end') { cancelAnimationFrame(animation); saveRecord(); renderResults(report); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); return; }
    renderRun(); saveRecord();
  }
  const PHASE_LABELS = { word_generation: '単語を考える', verb_generation: '動詞を考える', nonword_repetition: '頭の中で繰り返す', noun_repetition: '名詞を頭の中で繰り返す', rest: '休憩', intertask_rest: '課題間の休憩' };
  const PAUSE_REASONS = { manual: '操作によって一時停止しました．', hidden: 'タブが非表示になったため，一時停止しました．', blur: 'ウィンドウからフォーカスが移ったため，一時停止しました．', fullscreen_exit: '全画面表示を解除したため，一時停止しました．', frame_delay: '画面更新に 1 秒以上の遅れがあったため，一時停止しました．', focus_lost: '画面を表示してから再開してください．' };
  function renderRun() {
    if (!engine?.active) return;
    const p = engine.active, paused = engine.state === 'paused';
    $('run-task-name').textContent = p.taskName || '課題間の休憩'; $('run-status').textContent = paused ? '一時停止' : '実行中';
    $('run-position').textContent = p.taskOrder ? p.taskOrder + ' / ' + engine.config.order.length + ' 課題' : '';
    $('phase-label').textContent = PHASE_LABELS[p.condition]; $('stimulus').textContent = p.stimulus; $('stimulus').classList.toggle('fixation', ['rest','intertask_rest'].includes(p.type));
    $('phase-help').textContent = p.type === 'intertask_rest' ? '次は「' + p.nextTaskName + '」です' : p.type === 'rest' ? '注視点を見て，休んでください' : p.type === 'repeat' ? '表示された語を繰り返してください' : '声に出さず，頭の中で考えてください';
    $('run-cycle').textContent = p.cycle ? 'セット ' + p.cycle + ' / ' + p.taskCycles + (p.stimulusIndex && p.taskFamily === 'verb_generation' ? '　名詞 ' + p.stimulusIndex + ' / 5' : '') : '';
    $('pause-overlay').hidden = !paused; $('stimulus-stage').setAttribute('aria-hidden', String(paused)); $('run-timer').hidden = !engine.config.showTimer;
    document.querySelector('.run-header').inert = paused; document.querySelector('.run-footer').inert = paused;
    if (paused) { const event = engine.events[engine.events.length - 1]; $('pause-reason').textContent = PAUSE_REASONS[event.reason] || PAUSE_REASONS.manual; $('resume-button').focus(); }
  }
  function frame(now) {
    if (!engine || !['running','paused'].includes(engine.state)) return;
    if (engine.state === 'running') { if (lastFrame !== null && now - lastFrame > 1000) engine.pause(now, 'frame_delay'); else engine.tick(now); }
    lastFrame = now;
    if (engine.config.showTimer && engine.active) $('run-timer').textContent = '区間の残り ' + formatTime(engine.state === 'paused' ? engine.remainingMs : engine.deadline - now) + ' ／ 全体の経過 ' + formatTime(engine.activeElapsed(now));
    if (['running','paused'].includes(engine.state)) animation = requestAnimationFrame(frame);
  }
  function pause(reason = 'manual') { if (engine?.state === 'running') engine.pause(performance.now(), reason); }
  function resume() { if (engine?.state === 'paused' && !$('abort-dialog').open) { if (document.hidden) return; lastFrame = performance.now(); engine.resume(lastFrame); } }
  $('pause-button').addEventListener('click', () => pause()); $('resume-button').addEventListener('click', resume);
  $('run-fullscreen').addEventListener('click', requestFullscreen);
  function showAbort() { pause(); if (engine?.state === 'paused') $('abort-dialog').showModal(); }
  $('abort-button').addEventListener('click', showAbort); $('pause-abort').addEventListener('click', showAbort);
  $('abort-cancel').addEventListener('click', () => $('abort-dialog').close());
  $('abort-confirm').addEventListener('click', () => { $('abort-dialog').close(); engine?.abort(performance.now()); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('hidden'); });
  window.addEventListener('blur', () => pause('blur'));
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) fullscreenUsed = true; else if (fullscreenUsed) pause('fullscreen_exit'); });
  document.addEventListener('keydown', event => {
    if (!engine || !['running','paused'].includes(engine.state) || event.repeat || event.target.matches('input,textarea,button') || $('abort-dialog').open) return;
    if (event.code === 'Space') { event.preventDefault(); engine.state === 'running' ? pause() : resume(); }
    if (event.code === 'Escape') pause();
  });
  window.addEventListener('beforeunload', event => { if (engine && ['running','paused'].includes(engine.state)) { saveRecord(); event.preventDefault(); event.returnValue = ''; } });
  function renderResults(value) {
    report = value; showPage('results');
    const events = value.events || [], starts = events.filter(e => e.event === 'task_start'), completed = value.state === 'completed', aborted = value.state === 'aborted';
    $('results-title').textContent = completed ? '課題が終了しました' : aborted ? '実施を中止しました' : '前回の途中記録';
    $('results-subtitle').textContent = (value.config.participantId ? '参加者 ' + value.config.participantId + '　／　' : '') + '開始 ' + timeJst(value.started_at) + ' JST';
    $('record-status').textContent = completed ? '完了' : aborted ? '中止' : '未完了';
    $('result-icon').innerHTML = icon(completed ? 'check' : 'pause');
    $('result-task-count').textContent = starts.length + ' / ' + value.config.order.length;
    $('result-duration').textContent = formatTime(events.length ? events[events.length - 1].active_elapsed_ms : 0);
    $('result-pauses').textContent = events.filter(e => e.event === 'pause').length + ' 回';
    $('task-start-table').innerHTML = value.config.order.map((id, index) => {
      const start = starts.find(e => e.task_id === id), end = events.find(e => e.event === 'task_end' && e.task_id === id);
      return '<tr><td>' + String(index + 1).padStart(2, '0') + '</td><td>' + escape(TASKS[id]?.name || id) + '</td><td>' + (start ? timeJst(start.timestamp) : '—') + '</td><td><span class="tag">' + (end ? '完了' : start ? '中断' : '未実施') + '</span></td></tr>';
    }).join('');
    $('results-note').textContent = 'セッション ID：' + value.session_id + '．' + (completed || aborted ? '直近 1 回の記録を端末内にも保存します．' : '再読み込み前に保存できた時点までの記録です．中断中の区間の終了時刻は確定していません．') + (storageWarned ? ' 端末内保存に失敗したため，必ずダウンロードしてください．' : '');
  }
  function download(content, extension, suffix, type) {
    const filename = report.session_id + '_' + suffix + '.' + extension, blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  $('download-events').addEventListener('click', () => { if (report) download(csv(report.events), 'csv', 'events', 'text/csv;charset=utf-8'); });
  $('download-json').addEventListener('click', () => { if (report) download(JSON.stringify(report, null, 2), 'json', 'record', 'application/json'); });
  function showPrevious() { const value = cached || readStorage(RECORD_KEY); $('previous-record').hidden = !value?.events; if (value?.events) { cached = value; $('previous-record-info').textContent = timeJst(value.started_at) + ' JST　／　' + (value.state === 'completed' ? '完了' : value.state === 'aborted' ? '中止' : '未完了') + (value.config.participantId ? '　／　' + value.config.participantId : ''); } }
  $('back-home').addEventListener('click', () => { engine = null; showPage('home'); showPrevious(); updateSummary(); });
  $('view-previous').addEventListener('click', () => { if (cached) renderResults(cached); });
  $('app-version').textContent = 'v' + VERSION; renderTasks(); showPrevious();
})();
