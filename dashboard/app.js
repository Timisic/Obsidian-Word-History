(() => {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  const state = {
    analysis: null,
    sourceLabel: '',
    error: '',
    controls: {
      search: '',
      folder: 'all',
      mainTab: 'trend',
      rangeDays: 365,
      boardTab: 'notes',
      noteMetric: 'recent',
      folderMetric: 'current_words',
    },
    drawer: null,
  };

  const cache = { baseAnalysis: null };

  root.innerHTML = renderShell();
  const el = bindElements();
  bindEvents();
  loadDefaultAnalysis();
  window.addEventListener('resize', render);

  function bindElements() {
    return {
      sourceChip: document.getElementById('source-chip'),
      statusLine: document.getElementById('status-line'),
      search: document.getElementById('search-input'),
      folder: document.getElementById('folder-select'),
      upload: document.getElementById('upload-input'),
      uploadButton: document.getElementById('upload-button'),
      resetButton: document.getElementById('reset-button'),
      kpis: document.getElementById('kpi-grid'),
      mainCard: document.getElementById('main-card'),
      listCard: document.getElementById('list-card'),
      drawerOverlay: document.getElementById('drawer-overlay'),
      drawer: document.getElementById('drawer'),
      drawerTitle: document.getElementById('drawer-title'),
      drawerSub: document.getElementById('drawer-sub'),
      drawerBody: document.getElementById('drawer-body'),
      drawerClose: document.getElementById('drawer-close'),
      heroCurrentWords: document.getElementById('hero-current-words'),
      heroCurrentMeta: document.getElementById('hero-current-meta'),
    };
  }

  function bindEvents() {
    el.search.addEventListener('input', (event) => {
      state.controls.search = event.target.value.trim().toLowerCase();
      render();
    });
    el.folder.addEventListener('change', (event) => {
      state.controls.folder = event.target.value;
      render();
    });
    document.querySelectorAll('[data-main-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.controls.mainTab = button.dataset.mainTab;
        render();
      });
    });
    document.querySelectorAll('[data-range]').forEach((button) => {
      button.addEventListener('click', () => {
        state.controls.rangeDays = Number(button.dataset.range);
        render();
      });
    });
    document.querySelectorAll('[data-board-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.controls.boardTab = button.dataset.boardTab;
        render();
      });
    });
    document.querySelectorAll('[data-note-metric]').forEach((button) => {
      button.addEventListener('click', () => {
        state.controls.noteMetric = button.dataset.noteMetric;
        render();
      });
    });
    document.querySelectorAll('[data-folder-metric]').forEach((button) => {
      button.addEventListener('click', () => {
        state.controls.folderMetric = button.dataset.folderMetric;
        render();
      });
    });
    el.uploadButton.addEventListener('click', () => el.upload.click());
    el.upload.addEventListener('change', async (event) => {
      const [file] = Array.from(event.target.files || []);
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        hydrateAnalysis(payload, `上传：${file.name}`);
      } catch (error) {
        state.error = `上传失败：${error.message || String(error)}`;
        render();
      } finally {
        event.target.value = '';
      }
    });
    el.resetButton.addEventListener('click', async () => {
      if (cache.baseAnalysis) {
        hydrateAnalysis(cache.baseAnalysis, '默认数据');
      } else {
        await loadDefaultAnalysis();
      }
    });
    el.drawerClose.addEventListener('click', closeDrawer);
    el.drawerOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });
  }

  async function loadDefaultAnalysis() {
    const params = new URLSearchParams(window.location.search);
    const path = params.get('analysis') || document.body.dataset.defaultAnalysisPath;
    if (!path) {
      state.error = '未配置默认数据路径，请通过 serve 命令启动或手动上传 analysis.json。';
      render();
      return;
    }
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      cache.baseAnalysis = payload;
      hydrateAnalysis(payload, '默认数据');
    } catch (error) {
      state.error = `未能读取 ${path}。请先运行 serve 命令，或手动上传 analysis.json。`;
      render();
    }
  }

  function hydrateAnalysis(payload, sourceLabel) {
    state.analysis = normalizeAnalysis(payload);
    state.sourceLabel = sourceLabel;
    state.error = '';
    state.drawer = null;
    render();
  }

  function normalizeAnalysis(payload) {
    const notes = Array.isArray(payload.notes) ? payload.notes : [];
    const folders = Array.isArray(payload.folders) ? payload.folders : [];
    return {
      summary: payload.summary || {},
      commitTrend: Array.isArray(payload.commit_trend) ? payload.commit_trend : [],
      series: payload.series || {},
      notes,
      folders,
      folderOptions: buildFolderOptions(folders),
    };
  }

  function buildFolderOptions(folders) {
    return [
      { value: 'all', label: '全部目录' },
      ...folders.filter((item) => item.path !== '(root)').map((item) => ({ value: item.path, label: item.path })),
    ];
  }

  function render() {
    renderHeader();
    renderKpis();
    renderMainCard();
    renderListCard();
    renderDrawer();
  }

  function renderHeader() {
    const summary = state.analysis?.summary || {};
    el.sourceChip.textContent = state.sourceLabel || '等待数据';
    el.statusLine.textContent = state.error || '';
    el.statusLine.className = `status-line${state.error ? ' error' : ''}`;
    el.heroCurrentWords.textContent = state.analysis ? formatNumber(summary.latest_total_words) : '—';
    el.heroCurrentMeta.textContent = state.analysis ? `最新提交 ${formatDateTime(summary.latest_commit_at)}` : '';
    populateFolderSelect();
    syncTabStates();
  }

  function populateFolderSelect() {
    const options = state.analysis?.folderOptions || [{ value: 'all', label: '全部目录' }];
    el.folder.innerHTML = options
      .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === state.controls.folder ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
      .join('');
  }

  function syncTabStates() {
    document.querySelectorAll('[data-main-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mainTab === state.controls.mainTab);
    });
    document.querySelectorAll('[data-range]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.range) === state.controls.rangeDays);
    });
    document.querySelectorAll('[data-board-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.boardTab === state.controls.boardTab);
    });
    document.querySelectorAll('[data-note-metric]').forEach((button) => {
      button.classList.toggle('active', button.dataset.noteMetric === state.controls.noteMetric);
    });
    document.querySelectorAll('[data-folder-metric]').forEach((button) => {
      button.classList.toggle('active', button.dataset.folderMetric === state.controls.folderMetric);
    });
  }

  function renderKpis() {
    if (!state.analysis) {
      el.kpis.innerHTML = emptyBlock('暂无数据');
      return;
    }
    const summary = state.analysis.summary;
    const cards = [
      ['当前总字数', formatNumber(summary.latest_total_words), `${state.analysis.commitTrend.length} 个时间点`],
      ['追踪文档', formatNumber(summary.notes_tracked), `${formatNumber(summary.recent_30d_active_notes)} 篇最近活跃`],
      ['总 Commit', formatNumber(summary.commit_count), formatDateTime(summary.latest_commit_at)],
      ['近 30 天新增', signedNumber(summary.recent_30d_words_added), '按天聚合'],
    ];
    el.kpis.innerHTML = cards.map(([label, value, meta]) => `
      <article class="kpi-card">
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-value">${escapeHtml(value)}</div>
        <div class="kpi-meta">${escapeHtml(meta)}</div>
      </article>
    `).join('');
  }

  function renderMainCard() {
    if (!state.analysis) {
      el.mainCard.innerHTML = emptyBlock('图表将在载入数据后显示');
      return;
    }
    const isTrend = state.controls.mainTab === 'trend';
    const chartMarkup = isTrend
      ? renderLineChart(filteredTrend(state.analysis.commitTrend, state.controls.rangeDays))
      : renderBarChart(filteredDeltaSeries(state.analysis, state.controls.rangeDays));
    const caption = isTrend
      ? `范围：${state.controls.rangeDays === 0 ? '全部时间' : `${state.controls.rangeDays} 天`} · ${state.analysis.commitTrend.length} 个历史点`
      : deltaCaption(state.controls.rangeDays);
    el.mainCard.innerHTML = `
      <div class="section-head">
        <h2>${isTrend ? '总字数趋势' : '每日净增'}</h2>
        <div class="seg">
          <button class="seg-button${isTrend ? ' active' : ''}" data-main-tab="trend" type="button">趋势</button>
          <button class="seg-button${!isTrend ? ' active' : ''}" data-main-tab="delta" type="button">净增</button>
        </div>
      </div>
      <div class="seg" style="margin-bottom:12px">
        <button class="seg-button${state.controls.rangeDays === 30 ? ' active' : ''}" data-range="30" type="button">30 天</button>
        <button class="seg-button${state.controls.rangeDays === 90 ? ' active' : ''}" data-range="90" type="button">90 天</button>
        <button class="seg-button${state.controls.rangeDays === 365 ? ' active' : ''}" data-range="365" type="button">365 天</button>
        <button class="seg-button${state.controls.rangeDays === 0 ? ' active' : ''}" data-range="0" type="button">全部</button>
      </div>
      ${chartMarkup}
      <div class="chart-caption"><span>${escapeHtml(caption)}</span></div>
    `;
    bindChartInteractions(el.mainCard);
    bindDynamicTabHandlers(el.mainCard);
  }

  function renderListCard() {
    if (!state.analysis) {
      el.listCard.innerHTML = emptyBlock('榜单将在载入数据后显示');
      return;
    }
    const isNotes = state.controls.boardTab === 'notes';
    const items = isNotes ? rankedNotes() : rankedFolders();
    const controls = isNotes
      ? `
        <div class="seg">
          <button class="seg-button${state.controls.noteMetric === 'recent' ? ' active' : ''}" data-note-metric="recent" type="button">最近活跃</button>
          <button class="seg-button${state.controls.noteMetric === 'current' ? ' active' : ''}" data-note-metric="current" type="button">当前最多</button>
          <button class="seg-button${state.controls.noteMetric === 'growth' ? ' active' : ''}" data-note-metric="growth" type="button">历史增长</button>
        </div>`
      : `
        <div class="seg">
          <button class="seg-button${state.controls.folderMetric === 'current_words' ? ' active' : ''}" data-folder-metric="current_words" type="button">当前字数</button>
          <button class="seg-button${state.controls.folderMetric === 'touch_count_30d' ? ' active' : ''}" data-folder-metric="touch_count_30d" type="button">30 天活跃</button>
          <button class="seg-button${state.controls.folderMetric === 'net_growth' ? ' active' : ''}" data-folder-metric="net_growth" type="button">历史增长</button>
        </div>`;
    el.listCard.innerHTML = `
      <div class="section-head">
        <h2>${isNotes ? '文档榜单' : '文件夹榜单'}</h2>
        <div class="seg">
          <button class="seg-button${isNotes ? ' active' : ''}" data-board-tab="notes" type="button">文档</button>
          <button class="seg-button${!isNotes ? ' active' : ''}" data-board-tab="folders" type="button">文件夹</button>
        </div>
      </div>
      ${controls}
      <div class="list-frame">
        ${items.length ? items.map((item) => renderListItem(item, isNotes ? 'note' : 'folder')).join('') : '<div class="empty">没有匹配结果</div>'}
      </div>
    `;
    bindDynamicTabHandlers(el.listCard);
    el.listCard.querySelectorAll('.list-item').forEach((node) => {
      node.addEventListener('click', () => {
        state.drawer = { type: node.dataset.kind, id: node.dataset.id };
        renderDrawer();
      });
    });
  }

  function rankedNotes() {
    const notes = filteredNotes();
    const metric = state.controls.noteMetric;
    if (metric === 'current') return [...notes].sort((a, b) => b.current_words - a.current_words || a.path.localeCompare(b.path)).slice(0, 10);
    if (metric === 'growth') return [...notes].sort((a, b) => b.net_growth - a.net_growth || a.path.localeCompare(b.path)).slice(0, 10);
    return [...notes].sort((a, b) => b.touch_count_30d - a.touch_count_30d || a.path.localeCompare(b.path)).slice(0, 10);
  }

  function rankedFolders() {
    const folders = filteredFolders().filter((item) => item.path !== '(root)');
    const metric = state.controls.folderMetric;
    return [...folders].sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.path.localeCompare(b.path)).slice(0, 10);
  }

  function filteredNotes() {
    const search = state.controls.search;
    const folder = state.controls.folder;
    return (state.analysis?.notes || []).filter((item) => {
      const inFolder = folder === 'all' || item.folder === folder || item.path.startsWith(`${folder}/`);
      const inSearch = !search || item.path.toLowerCase().includes(search) || lastSegment(item.path).toLowerCase().includes(search);
      return inFolder && inSearch;
    });
  }

  function filteredFolders() {
    const search = state.controls.search;
    const folder = state.controls.folder;
    return (state.analysis?.folders || []).filter((item) => {
      const inFolder = folder === 'all' || item.path === folder || item.path.startsWith(`${folder}/`);
      const inSearch = !search || item.path.toLowerCase().includes(search);
      return inFolder && inSearch;
    });
  }

  function renderListItem(item, kind) {
    const title = kind === 'note' ? lastSegment(item.path) : item.path;
    const sub = kind === 'note' ? item.path : `${formatNumber(item.note_count)} 篇文档`;
    const metric = kind === 'note' ? noteMetricPill(item) : folderMetricPill(item);
    const meta = kind === 'note'
      ? `最近更新 ${formatDateTime(item.latest_touch_at)}`
      : `最近更新 ${formatDateTime(item.latest_touch_at)}`;
    return `
      <article class="list-item" data-kind="${kind}" data-id="${escapeHtml(item.path)}">
        <div class="list-top">
          <div>
            <div class="list-title">${escapeHtml(title)}</div>
            <div class="list-sub">${escapeHtml(sub)}</div>
          </div>
          ${metric}
        </div>
        <div class="micro">${escapeHtml(meta)}</div>
      </article>
    `;
  }

  function noteMetricPill(item) {
    if (state.controls.noteMetric === 'current') return pill(`当前 ${formatNumber(item.current_words)}`);
    if (state.controls.noteMetric === 'growth') return pill(`增长 ${signedNumber(item.net_growth)}`);
    return pill(`30 天 ${formatNumber(item.touch_count_30d)} 次`);
  }

  function folderMetricPill(item) {
    if (state.controls.folderMetric === 'current_words') return pill(`当前 ${formatNumber(item.current_words)}`);
    if (state.controls.folderMetric === 'net_growth') return pill(`增长 ${signedNumber(item.net_growth)}`);
    return pill(`30 天 ${formatNumber(item.touch_count_30d)} 次`);
  }

  function renderDrawer() {
    if (!state.analysis || !state.drawer) {
      el.drawer.classList.remove('open');
      el.drawerOverlay.classList.remove('open');
      document.body.classList.remove('drawer-open');
      return;
    }
    document.body.classList.add('drawer-open');
    el.drawer.classList.add('open');
    el.drawerOverlay.classList.add('open');

    if (state.drawer.type === 'note') {
      const note = state.analysis.notes.find((item) => item.path === state.drawer.id);
      if (!note) return closeDrawer();
      el.drawerTitle.textContent = lastSegment(note.path);
      el.drawerSub.textContent = note.path;
      el.drawerBody.innerHTML = `
        <div class="drawer-grid">
          ${field('当前字数', formatNumber(note.current_words))}
          ${field('历史峰值', formatNumber(note.peak_words))}
          ${field('历史增长', signedNumber(note.net_growth))}
          ${field('30 天触达', formatNumber(note.touch_count_30d))}
          ${field('总触达次数', formatNumber(note.touch_count_total))}
          ${field('最近更新', formatDateTime(note.latest_touch_at))}
          ${field('所在目录', note.folder)}
          ${field('峰值时间', formatDateTime(note.peak_words_at))}
        </div>
      `;
      return;
    }

    const folder = state.analysis.folders.find((item) => item.path === state.drawer.id);
    if (!folder) return closeDrawer();
    const childNotes = state.analysis.notes
      .filter((item) => item.folder === folder.path || item.path.startsWith(`${folder.path}/`))
      .sort((a, b) => b.current_words - a.current_words || a.path.localeCompare(b.path))
      .slice(0, 6);
    el.drawerTitle.textContent = folder.path;
    el.drawerSub.textContent = `${formatNumber(folder.note_count)} 篇当前文档`;
    el.drawerBody.innerHTML = `
      <div class="drawer-grid">
        ${field('当前总字数', formatNumber(folder.current_words))}
        ${field('历史增长', signedNumber(folder.net_growth))}
        ${field('30 天触达', formatNumber(folder.touch_count_30d))}
        ${field('30 天活跃文档', formatNumber(folder.active_notes_30d))}
        ${field('当前文档数', formatNumber(folder.note_count))}
        ${field('最近更新', formatDateTime(folder.latest_touch_at))}
      </div>
      <div class="drawer-list">
        ${childNotes.map((item) => `<div class="drawer-item"><strong>${escapeHtml(lastSegment(item.path))}</strong><div class="micro">${escapeHtml(item.path)}</div></div>`).join('') || '<div class="micro">当前目录没有可展示的文档。</div>'}
      </div>
    `;
  }

  function closeDrawer() {
    state.drawer = null;
    el.drawer.classList.remove('open');
    el.drawerOverlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
  }

  function renderLineChart(series) {
    if (!series.length) return '<div class="empty">暂无趋势数据</div>';
    const width = 940;
    const height = 380;
    const margin = { top: 24, right: 24, bottom: 56, left: 78 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const values = series.map((item) => item.total_words);
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const midY = Math.round((minY + maxY) / 2);
    const xScale = (index) => margin.left + (innerWidth * index) / Math.max(series.length - 1, 1);
    const yScale = (value) => margin.top + innerHeight - ((value - minY) / Math.max(maxY - minY, 1)) * innerHeight;
    const path = series.map((item, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(item.total_words)}`).join(' ');
    const overlays = series.map((item, index) => {
      const x = xScale(index);
      return `<rect data-point-index="${index}" x="${Math.max(margin.left, x - innerWidth / Math.max(series.length, 20) / 2)}" y="${margin.top}" width="${Math.max(8, innerWidth / Math.max(series.length, 20))}" height="${innerHeight}" fill="transparent"></rect>`;
    }).join('');
    const yTicks = [maxY, midY, minY];
    const yTickMarkup = yTicks.map((value) => {
      const y = yScale(value);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(77,55,41,0.08)" />
        <line x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="rgba(77,55,41,0.28)" />
        <text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" class="axis-tick-label">${formatCompactNumber(value)}</text>
      `;
    }).join('');
    const xTickIndexes = Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]));
    const xTickMarkup = xTickIndexes.map((index) => {
      const x = xScale(index);
      return `
        <line x1="${x}" y1="${margin.top + innerHeight}" x2="${x}" y2="${margin.top + innerHeight + 6}" stroke="rgba(77,55,41,0.28)" />
        <text x="${x}" y="${margin.top + innerHeight + 24}" text-anchor="middle" class="axis-tick-label">${escapeHtml(formatAxisDate(series[index].timestamp))}</text>
      `;
    }).join('');
    return `
      <div class="chart-stage" data-chart-kind="line" data-points='${escapeAttr(JSON.stringify(series.map((item) => ({ x: item.timestamp, y: item.total_words }))))}'>
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="总字数趋势图">
          ${yTickMarkup}
          <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" stroke="rgba(77,55,41,0.28)" />
          <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="rgba(77,55,41,0.28)" />
          <path d="${path}" fill="none" stroke="${'#b95e43'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle class="hover-dot" cx="${xScale(series.length - 1)}" cy="${yScale(series[series.length - 1].total_words)}" r="5" fill="${'#b95e43'}"></circle>
          ${overlays}
          ${xTickMarkup}
          <text x="${margin.left - 50}" y="${margin.top + innerHeight / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 ${margin.left - 50} ${margin.top + innerHeight / 2})">总字数</text>
          <text x="${margin.left + innerWidth / 2}" y="${height - 12}" text-anchor="middle" class="axis-label">时间</text>
        </svg>
        <div class="chart-tooltip"></div>
      </div>
    `;
  }

  function renderBarChart(series) {
    if (!series.length) return '<div class="empty">暂无净增数据</div>';
    const width = 940;
    const height = 380;
    const margin = { top: 24, right: 18, bottom: 32, left: 24 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const values = series.map((item) => item.net_words_added);
    const minY = Math.min(...values, 0);
    const maxY = Math.max(...values, 0);
    const zeroY = margin.top + innerHeight - ((0 - minY) / Math.max(maxY - minY, 1)) * innerHeight;
    const barWidth = Math.max(6, innerWidth / Math.max(series.length * 1.8, 1));
    const bars = series.map((item, index) => {
      const x = margin.left + (innerWidth * index) / Math.max(series.length - 1, 1) - barWidth / 2;
      const y = margin.top + innerHeight - ((item.net_words_added - minY) / Math.max(maxY - minY, 1)) * innerHeight;
      const top = Math.min(y, zeroY);
      const heightValue = Math.abs(zeroY - y);
      return `<rect data-point-index="${index}" x="${x}" y="${top}" width="${barWidth}" height="${Math.max(heightValue, 2)}" rx="6" fill="${item.net_words_added >= 0 ? '#b95e43' : '#d8b7a8'}"></rect>`;
    }).join('');
    return `
      <div class="chart-stage" data-chart-kind="bar" data-points='${escapeAttr(JSON.stringify(series.map((item) => ({ x: item.date, y: item.net_words_added }))))}'>
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="每日净增图">
          <line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" stroke="rgba(77,55,41,0.12)" />
          ${bars}
        </svg>
        <div class="chart-tooltip"></div>
      </div>
    `;
  }

  function bindChartInteractions(scope) {
    scope.querySelectorAll('.chart-stage').forEach((stage) => {
      const tooltip = stage.querySelector('.chart-tooltip');
      const points = JSON.parse(stage.dataset.points || '[]');
      if (!points.length) return;
      stage.addEventListener('mousemove', (event) => {
        const rect = stage.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
        const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
        const point = points[index];
        tooltip.innerHTML = `<strong>${escapeHtml(formatTooltipDate(point.x))}</strong><br>${state.controls.mainTab === 'trend' ? `总字数 ${formatNumber(point.y)}` : `净增 ${signedNumber(point.y)}`}`;
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top}px`;
        tooltip.classList.add('visible');
      });
      stage.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }

  function bindDynamicTabHandlers(scope) {
    scope.querySelectorAll('[data-main-tab]').forEach((button) => button.addEventListener('click', () => { state.controls.mainTab = button.dataset.mainTab; render(); }));
    scope.querySelectorAll('[data-range]').forEach((button) => button.addEventListener('click', () => { state.controls.rangeDays = Number(button.dataset.range); render(); }));
    scope.querySelectorAll('[data-board-tab]').forEach((button) => button.addEventListener('click', () => { state.controls.boardTab = button.dataset.boardTab; render(); }));
    scope.querySelectorAll('[data-note-metric]').forEach((button) => button.addEventListener('click', () => { state.controls.noteMetric = button.dataset.noteMetric; render(); }));
    scope.querySelectorAll('[data-folder-metric]').forEach((button) => button.addEventListener('click', () => { state.controls.folderMetric = button.dataset.folderMetric; render(); }));
  }

  function filteredTrend(series, rangeDays) {
    if (!rangeDays || rangeDays <= 0 || !series.length) return series;
    const last = new Date(series[series.length - 1].timestamp);
    const cutoff = new Date(last);
    cutoff.setDate(last.getDate() - rangeDays);
    return series.filter((item) => new Date(item.timestamp) >= cutoff);
  }

  function filteredDeltaSeries(analysis, rangeDays) {
    const { key, label } = chooseDeltaBucket(rangeDays);
    const series = analysis.series[key] || [];
    return filterPeriodSeries(series, rangeDays);
  }

  function chooseDeltaBucket(rangeDays) {
    if (!rangeDays || rangeDays <= 0) return { key: 'monthly_deltas', label: '按月净增' };
    if (rangeDays <= 45) return { key: 'daily_deltas', label: '按日净增' };
    if (rangeDays <= 180) return { key: 'weekly_deltas', label: '按周净增' };
    return { key: 'monthly_deltas', label: '按月净增' };
  }

  function filterPeriodSeries(series, rangeDays) {
    if (!rangeDays || rangeDays <= 0 || !series.length) return series;
    const last = new Date(series[series.length - 1].date);
    const cutoff = new Date(last);
    cutoff.setDate(last.getDate() - rangeDays);
    return series.filter((item) => new Date(item.date) >= cutoff);
  }

  function deltaCaption(rangeDays) {
    const { label } = chooseDeltaBucket(rangeDays);
    return `${label} · ${rangeDays === 0 ? '全部时间' : `${rangeDays} 天范围`}`;
  }

  function renderShell() {
    return `
      <header class="topbar">
        <div class="title-wrap">
          <div class="brand"><span class="brand-dot"></span> Obsidian Word History</div>
        </div>
        <div class="toolbar">
          <span id="source-chip" class="toolbar-chip">等待数据</span>
          <button id="upload-button" class="toolbar-button" type="button">上传数据</button>
          <button id="reset-button" class="toolbar-button primary" type="button">重置</button>
          <input id="upload-input" class="file-input" type="file" accept=".json,application/json" />
        </div>
      </header>

      <section class="hero-panel">
        <div class="hero-grid">
          <div>
            <div id="hero-current-words" class="title" style="font-size: clamp(42px, 7vw, 72px);">—</div>
            <div id="hero-current-meta" class="subtitle">运行 serve 后自动载入</div>
          </div>
        </div>
      </section>

      <div class="controls">
        <input id="search-input" class="search-input" type="search" placeholder="搜索文档或目录" />
        <select id="folder-select" class="select-input"></select>
        <div class="micro" style="display:flex;align-items:center;justify-content:flex-end;">点击榜单项可展开详情</div>
      </div>

      <div id="status-line" class="status-line"></div>
      <section id="kpi-grid" class="kpi-grid"></section>

      <section class="content-grid">
        <article id="main-card" class="main-card"></article>
        <article id="list-card" class="list-card"></article>
      </section>

      <div id="drawer-overlay" class="drawer-overlay"></div>
      <aside id="drawer" class="drawer" aria-label="详情">
        <div class="drawer-header">
          <div>
            <h3 id="drawer-title">详情</h3>
            <div id="drawer-sub" class="drawer-sub"></div>
          </div>
          <button id="drawer-close" class="drawer-close" type="button">×</button>
        </div>
        <div id="drawer-body" class="drawer-body"></div>
      </aside>
    `;
  }

  function field(label, value) {
    return `<div class="field-card"><div class="field-label">${escapeHtml(label)}</div><div class="field-value">${escapeHtml(value)}</div></div>`;
  }

  function pill(text) {
    return `<span class="metric-pill">${escapeHtml(text)}</span>`;
  }

  function emptyBlock(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  }

  function signedNumber(value) {
    const number = Number(value || 0);
    return `${number > 0 ? '+' : ''}${formatNumber(number)}`;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  function formatTooltipDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  function formatAxisDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: 'numeric', day: 'numeric' }).format(date);
  }

  function formatCompactNumber(value) {
    return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
  }

  function lastSegment(path) {
    const parts = String(path).split('/');
    return parts[parts.length - 1] || path;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();
