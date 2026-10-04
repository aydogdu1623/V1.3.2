/* Report scope: searchable, persistent multi-selection shared by all exports. */
(() => {
  'use strict';
  const types = ['block', 'facade', 'item'];
  const titles = {block: 'Blok', facade: 'Cephe', item: 'İş kalemi'};
  const anchors = {};
  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').trim().toLocaleLowerCase('tr-TR');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selected = type => v52ReportState[{block:'blocks',facade:'facades',item:'items'}[type]];

  function rowKeys(type, row) {
    if (type !== 'item' || !row.key.startsWith('__group__')) return [row.key];
    return v52ItemsForSelectedFacades()
      .filter(([, , name]) => norm(name) === row.key.slice(9))
      .map(([b, f, name]) => v52ItemKey(b, f, name));
  }
  function rows(type) {
    return v59PickerRows(type).map(row => {
      const keys = rowKeys(type, row), count = keys.filter(key => selected(type).has(key)).length;
      return {...row, keys, active: keys.length > 0 && count === keys.length, mixed: count > 0 && count < keys.length};
    });
  }
  function visibleRows(type) {
    const query = norm(v55PickerSearch[type]);
    return rows(type).filter(row => norm(`${row.label} ${row.sub}`).includes(query));
  }
  function applyRows(type, entries, checked) {
    for (const row of entries) {
      const wasSelected = selected(type).has(row.key);
      for (const key of row.keys) checked ? selected(type).add(key) : selected(type).delete(key);
      // A newly included block/facade brings its real work items into the report.
      if (checked && !wasSelected && type !== 'item') {
        const facades = type === 'block'
          ? Object.keys(DATA[row.key] || {}).map(f => [row.key, f])
          : [v52ParseFacadeKey(row.key)];
        for (const [b, f] of facades) {
          v52ReportState.facades.add(v52FacadeKey(b, f));
          v53ValidRawItems(b, f).forEach(raw => v52ReportState.items.add(v52ItemKey(b, f, raw[0])));
        }
      }
    }
    v57CleanReportState();
    v59RefreshReportOutsidePicker();
  }
  function choose(type, key, checked, range = false) {
    const visible = visibleRows(type), end = visible.findIndex(row => row.key === key);
    if (end < 0) return;
    const start = range ? visible.findIndex(row => row.key === anchors[type]) : -1;
    applyRows(type, start < 0 ? [visible[end]] : visible.slice(Math.min(start, end), Math.max(start, end) + 1), checked);
    if (start < 0) anchors[type] = key;
  }
  function close(type, focus = true) {
    $(`v55${type}Pop`)?.classList.remove('open');
    const trigger = $(`v55${type}Trigger`);
    trigger?.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
    if (focus) trigger?.focus();
  }
  function renderList(type, preserveScroll = true) {
    const pop = $(`v55${type}Pop`), list = pop?.querySelector('.v184-report-options');
    if (!list) return;
    const scroll = preserveScroll ? list.scrollTop : 0;
    const focusedKey = document.activeElement?.dataset?.reportKey;
    const visible = visibleRows(type);
    list.innerHTML = visible.length ? visible.map(row => `<label class="v184-report-option ${row.active || row.mixed ? 'selected' : ''}">
      <input type="checkbox" data-report-key="${escape(row.key)}" ${row.active ? 'checked' : ''} aria-checked="${row.mixed ? 'mixed' : String(row.active)}">
      <span>${escape(row.label)}${row.sub ? `<small>${escape(row.sub)}</small>` : ''}</span>
    </label>`).join('') : '<p class="v184-report-empty">Eşleşen kayıt yok.</p>';
    list.querySelectorAll('input').forEach((input, index) => {
      input.indeterminate = visible[index].mixed;
      if (input.dataset.reportKey === focusedKey) input.focus({preventScroll:true});
    });
    list.scrollTop = scroll;
    const allRows = rows(type), count = allRows.filter(row => row.active).length;
    pop.querySelector('[data-report-status]').textContent = `${count} / ${allRows.length} seçili · ${visible.length} sonuç`;
    pop.querySelector('[data-report-action="all"]').disabled = visible.length === 0;
    pop.querySelector('[data-report-action="clear"]').disabled = visible.length === 0;
  }
  function renderPicker(type, preserveScroll = true) {
    const pop = $(`v55${type}Pop`), trigger = $(`v55${type}Trigger`);
    if (!pop || !trigger || !types.includes(type)) return;
    if (!pop.querySelector('.v184-report-options')) {
      pop.innerHTML = `<div class="v184-report-tools">
        <input type="search" class="v55-pop-search" placeholder="Ara..." aria-label="${titles[type]} ara" value="${escape(v55PickerSearch[type] || '')}">
        <div><button type="button" class="small-btn" data-report-action="all">Sonuçları seç</button>
        <button type="button" class="small-btn" data-report-action="clear">Sonuçları temizle</button>
        <button type="button" class="small-btn" data-report-action="done">Bitti</button></div>
      </div><div class="v184-report-options" role="group" aria-label="${titles[type]} çoklu seçim"></div>
      <p class="v184-report-status" data-report-status role="status" aria-live="polite"></p>`;
      let shift = false;
      pop.onclick = event => {
        event.stopPropagation();
        if (event.target.matches('input[data-report-key]')) shift = event.shiftKey;
        const action = event.target.closest('[data-report-action]')?.dataset.reportAction;
        if (!action) return;
        event.preventDefault();
        if (action === 'done') return close(type);
        applyRows(type, visibleRows(type), action === 'all');
        renderList(type);
      };
      pop.onchange = event => {
        const key = event.target.dataset.reportKey;
        if (!key) return;
        choose(type, key, event.target.checked, shift);
        shift = false;
        renderList(type);
      };
      pop.oninput = event => {
        if (!event.target.matches('.v55-pop-search')) return;
        v55PickerSearch[type] = event.target.value;
        renderList(type, false);
      };
      pop.onkeydown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close(type);
      };
    }
    pop.classList.add('open');
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    renderList(type, preserveScroll);
  }

  v55RenderPicker = renderPicker;
  v59RenderPicker = renderPicker;
  const previousClose = v55ClosePickers;
  v55ClosePickers = function(except = '') {
    previousClose(except);
    types.filter(type => type !== except).forEach(type => close(type, false));
  };
  function prepare() {
    const report = $('settingsReport');
    if (!report) return;
    types.forEach(type => {
      const trigger = $(`v55${type}Trigger`);
      if (!trigger) return;
      trigger.setAttribute('aria-label', `${titles[type]} filtrele ve çoklu seç`);
      trigger.setAttribute('aria-controls', `v55${type}Pop`);
      trigger.setAttribute('aria-expanded', String($(`v55${type}Pop`)?.classList.contains('open') || false));
    });
    const bar = report.querySelector('.v55-pickerbar');
    if (bar && !$('v184ReportHelp')) {
      const help = document.createElement('p');
      help.id = 'v184ReportHelp';
      help.textContent = 'Blok, cephe ve iş kalemlerini arayıp kutucuklarla çoklu seçin. Shift ile aralık seçebilirsiniz. Excel, Word ve PDF bu seçimleri kullanır.';
      bar.before(help);
    }
  }
  prepare();
  const report = $('settingsReport');
  if (report) new MutationObserver(prepare).observe(report, {childList:true, subtree:true});
  window.__report184 = {rows, visibleRows, applyRows, choose};
})();
