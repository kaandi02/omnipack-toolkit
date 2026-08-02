const vscode = acquireVsCodeApi();
const initData = JSON.parse(document.getElementById('init-data').textContent || '{}');
const categories = initData.categories || {};
const typeIcons = initData.typeIcons || {};

let activeType = null;
let loadedRecords = {};
let selectedItems = {};
let allSelectedItems = [];
let sidebarFilter = '';

let currentPage = 1;
const PAGE_SIZE = 50;

vscode.postMessage({ command: 'ready' });

function renderTypeIcon(type) {
  const iconName = typeIcons[type];
  return iconName
    ? `<span class="material-symbols-outlined">${iconName}</span>`
    : '<span class="material-symbols-outlined">deployed_code</span>';
}

function buildSidebar() {
  const container = document.getElementById('sidebar-list');
  container.innerHTML = '';
  for (const [cat, types] of Object.entries(categories)) {
    const filtered = types.filter(t => t.toLowerCase().includes(sidebarFilter.toLowerCase()));
    if (filtered.length === 0){ continue ;}

    const group = document.createElement('details');
    group.className = 'category-group';
    group.open = true;

    const label = document.createElement('summary');
    label.className = 'category-label';
    label.textContent = cat;
    group.appendChild(label);

    for (const type of filtered) {
      const item = document.createElement('div');
      item.className = 'type-item' + (type === activeType ? ' active' : '');
      const selCount = selectedItems[type] ? selectedItems[type].size : 0;
      const badge = selCount > 0 ? selCount : (loadedRecords[type] ? loadedRecords[type].length : '');

      item.innerHTML = `
          ${renderTypeIcon(type)}
          <span>${type}</span>
          ${badge !== '' ? `<span class="type-badge">${badge}</span>` : ''}
        `;
      item.onclick = () => selectType(type);
      group.appendChild(item);
    }
    container.appendChild(group);
  }
}

function filterSidebar(val) {
  sidebarFilter = val;
  buildSidebar();
}

function selectType(type) {
  activeType = type;
  currentPage = 1;
  buildSidebar();
  document.getElementById('content-header').style.display = 'flex';
  document.getElementById('header-type-name').textContent = type;

  if (loadedRecords[type]) {
    renderRecords(type, loadedRecords[type]);
  } else {
    vscode.postMessage({ command: 'fetchDatapacks', type });
  }
}

function renderRecords(type, records) {
  const list = document.getElementById('datapack-list');
  if (!records || records.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text3); font-size:12px;">No records found for ${type}.</div>`;
    return;
  }
  
  currentVisibleData = records;
  list.innerHTML = `
      <input type="text" placeholder="Filter..." style="width:100%; padding:8px 12px; margin-bottom:12px; background:var(--bg2); border:1px solid var(--border); color:var(--text); border-radius:4px; font-family:var(--mono); font-size:12px;" oninput="filterRecords(this.value)">
      <div class="record-grid" id="record-grid"></div>
      <div id="pagination-controls" class="pagination-controls"></div>
    `;
  renderGrid();
  updateSelCounter();
}

function filterRecords(val) {
  currentPage = 1;
  const lower = val.toLowerCase();
  currentVisibleData = loadedRecords[activeType].filter(r => r.name.toLowerCase().includes(lower));
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('record-grid');
  if (!grid){ return; }
  
  const sel = selectedItems[activeType] || new Set();
  const total = currentVisibleData.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  
  if (currentPage > totalPages){ currentPage = totalPages; }
  const paginated = currentVisibleData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  grid.innerHTML = '';
  for (const r of paginated) {
    const isSelected = sel.has(r.id);
    const card = document.createElement('div');
    card.className = 'record-card' + (isSelected ? ' selected' : '');
    card.dataset.id = r.id;
    card.innerHTML = `
        <div class="record-checkbox"></div>
        <div class="record-info">
          <div class="record-name">${escHtml(r.name)}</div>
          <div style="font-size:10px; font-family:var(--mono); color:var(--text3); margin-top:2px;">${escHtml(r.id)}</div>
        </div>
      `;
    card.onclick = () => toggleRecord(activeType, r.id, r.name);
    grid.appendChild(card);
  }
  
  const pageCtrl = document.getElementById('pagination-controls');
  if(total > PAGE_SIZE) {
      pageCtrl.innerHTML = `
          <button class="btn btn-ghost" onclick="prevPage()" ${currentPage === 1 ? 'disabled' : ''}>◀ Prev</button>
          <span style="font-size: 14px; font-family: var(--mono); color: var(--text2);">Page ${currentPage} of ${totalPages}</span>
          <button class="btn btn-ghost" onclick="nextPage()" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
      `;
  } else {
      pageCtrl.innerHTML = '';
  }
}

function prevPage() { if(currentPage > 1) { currentPage--; renderGrid(); } }
function nextPage() { currentPage++; renderGrid(); }

function toggleRecord(type, id, name) {
  if (!selectedItems[type]) selectedItems[type] = new Set();
  const sel = selectedItems[type];
  sel.has(id) ? sel.delete(id) : sel.add(id);
  
  const card = document.querySelector(`.record-card[data-id="${CSS.escape(id)}"]`);
  if (card) card.classList.toggle('selected', sel.has(id));

  rebuildSelected();
  updateExportBar();
  buildSidebar();
}

function selectAll() {
  if (!activeType || !loadedRecords[activeType]) return;
  if (!selectedItems[activeType]) selectedItems[activeType] = new Set();
  for (const r of currentVisibleData) selectedItems[activeType].add(r.id);
  renderGrid(); rebuildSelected(); updateExportBar(); buildSidebar();
}

function selectNone() {
  if (!activeType) return;
  selectedItems[activeType] = new Set();
  renderGrid(); rebuildSelected(); updateExportBar(); buildSidebar();
}

function rebuildSelected() {
  allSelectedItems = [];
  for (const [type, ids] of Object.entries(selectedItems)) {
    const records = loadedRecords[type] || [];
    for (const id of ids) {
      const rec = records.find(r => r.id === id);
      if (rec) allSelectedItems.push({ type, id, name: rec.name });
    }
  }
  updateSelCounter();
}

function updateSelCounter() {
  document.getElementById('sel-count').textContent = `${selectedItems[activeType] ? selectedItems[activeType].size : 0} sel`;
}

function updateExportBar() {
  const total = allSelectedItems.length;
  document.getElementById('export-bar').className = total === 0 ? 'export-bar hidden' : 'export-bar';
  document.getElementById('export-count').textContent = total;
}

function triggerReviewModal() {
  const list = document.getElementById('confirm-list');
  list.innerHTML = '';
  
  const grouped = {};
  for (const item of allSelectedItems) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
  }

  for (const [type, items] of Object.entries(grouped)) {
      const groupDiv = document.createElement('div');
      groupDiv.style.marginBottom = '12px';
      groupDiv.innerHTML = `<div style="font-weight:700; color:var(--text); margin-bottom:6px; font-size:13px;">${renderTypeIcon(type)} ${type} <span style="color:var(--accent); margin-left:4px;">(${items.length})</span></div>`;
      
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.paddingLeft = '20px';
      ul.style.margin = '0';
      ul.style.lineHeight = '1.6';
      
      for (const item of items) {
          const li = document.createElement('li');
          li.style.position = 'relative';
          li.innerHTML = `<span style="position:absolute; left:-12px; color:var(--text3);">•</span> ${escHtml(item.name)}`;
          ul.appendChild(li);
      }
      groupDiv.appendChild(ul);
      list.appendChild(groupDiv);
  }

  document.getElementById('confirm-overlay').classList.add('visible');
}

function closeReviewModal() {
  document.getElementById('confirm-overlay').classList.remove('visible');
}

function executeExport(withDependencies) {
  closeReviewModal();
  vscode.postMessage({ command: 'exportDatapacks', keys: allSelectedItems, withDependencies });
}

function cancelOperation() {
  vscode.postMessage({ command: 'cancelOperation' });
}

function clearCacheAndRefresh() {
  loadedRecords = {};
  vscode.postMessage({ command: 'clearCache' });
  if (activeType) {
    document.getElementById('datapack-list').innerHTML = `<div style="text-align:center; padding:40px; font-size:12px;">Refreshing ${activeType}...</div>`;
    vscode.postMessage({ command: 'fetchDatapacks', type: activeType });
  }
}

function closeResult() {
  document.getElementById('result-overlay').classList.remove('visible');
  selectedItems = {}; allSelectedItems = [];
  updateExportBar(); buildSidebar();
  if (activeType && loadedRecords[activeType]) renderGrid();
  updateSelCounter();
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.command) {
    case 'orgUpdated':
      document.getElementById('org-badge').textContent = msg.username ? msg.username : 'No Org';
      break;
    case 'datapacksLoading':
      if (msg.type !== activeType){ break; }
      document.getElementById('datapack-list').innerHTML = `<div style="text-align:center; padding:40px; font-size:14px; color:var(--text2);">
          <div style="margin-bottom:12px;">Querying Salesforce Org for ${msg.type}...</div>
          <button class="btn btn-danger" onclick="cancelOperation()">Cancel Request</button>
        </div>`;
      break;
    case 'datapacksLoaded':
      loadedRecords[msg.type] = msg.records;
      buildSidebar();
      if (msg.type === activeType){ renderRecords(msg.type, msg.records); }
      break;
    case 'datapacksError':
      if (msg.type === activeType){ document.getElementById('datapack-list').innerHTML = `<div style="text-align:center; padding:40px; color:var(--red); font-size:13px;">${escHtml(msg.error)}</div>`;}
      break;
    case 'exportStarted':
      document.getElementById('progress-overlay').classList.add('visible');
      document.getElementById('progress-fill').style.width = '0%';
      break;
    case 'exportProgress':
      document.getElementById('progress-fill').style.width = Math.round((msg.current / msg.total) * 100) + '%';
      document.getElementById('progress-sub').textContent = `${msg.current} / ${msg.total} - ${escHtml(msg.name)}`;
      break;
    case 'operationCancelled':
      document.getElementById('progress-overlay').classList.remove('visible');
      if (msg.isExport) {
          document.getElementById('result-overlay').classList.add('visible');
          document.getElementById('result-icon').textContent = '';
          document.getElementById('result-title').textContent = 'Export Queue Stopped';
          document.getElementById('result-details').innerHTML = msg.message + "<br><br><span style='color:var(--text3)'>*Note: Your OS may still finish exporting the single item that was actively running when you clicked Stop.</span>";
      } else if (activeType) {
          renderRecords(activeType, loadedRecords[activeType] || []);
      }
      break;
    case 'exportComplete':
    case 'exportError':
      document.getElementById('progress-overlay').classList.remove('visible');
      document.getElementById('result-overlay').classList.add('visible');
      document.getElementById('result-icon').textContent = msg.command === 'exportComplete' ? '✅' : '❌';
      document.getElementById('result-title').textContent = msg.command === 'exportComplete' ? 'Export Complete' : 'Export Failed';
      document.getElementById('result-details').textContent = msg.error || `Exported ${msg.completed}, ${msg.failed} failed`;
      break;
    case 'exportCancelled':
      document.getElementById('progress-overlay').classList.remove('visible');
      break;
  }
});

buildSidebar();
