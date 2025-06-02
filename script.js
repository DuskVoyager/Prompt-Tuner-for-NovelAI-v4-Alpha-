// script.js

// ─── Sortable.js インスタンス管理用 ─────────────────────────────────────────
const sortableInstances = {};

// ─── データ構造の初期化 ─────────────────────────────────────────
const state = {
  base: [],        // ベースプロンプトのタグ配列
  negative: [],    // ネガティブプロンプトのタグ配列
  extra: [],       // 補完スペースのタグ配列
  characters: [[]] // キャラクタープロンプト配列（最初は1つ）
};

// ─── weight マップ（括弧数 → 数値）────────────────────────────────────────
const weightMap = {
  positive: [
    1.00, 1.05, 1.10, 1.16, 1.22, 1.28, 1.34, 1.41, 1.48, 1.55,
    1.63, 1.71, 1.80, 1.89, 1.98, 2.08, 2.18, 2.29, 2.41, 2.53, 2.65
  ],
  negative: [
    1.00, 0.95, 0.91, 0.86, 0.82, 0.78, 0.75, 0.71, 0.68, 0.64,
    0.61, 0.58, 0.56, 0.53, 0.51, 0.48, 0.46, 0.44, 0.42, 0.40, 0.38
  ]
};

// ─── ダークモード切り替え機能 ───────────────────────────────────
const themeToggleBtn = document.getElementById('theme-toggle');
themeToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  themeToggleBtn.textContent = document.body.classList.contains('dark-mode')
    ? '☀️ ライトモード'
    : '🌙 ダークモード';
});

// ─── コピー機能：指定ID のテキストをクリップボードにコピー ───────────
function copyPrompt(elementId) {
  const text = document.getElementById(elementId)?.textContent || '';
  if (!text) {
    alert('コピーするテキストがありません。');
    return;
  }
  navigator.clipboard.writeText(text)
    .then(() => {
      alert('クリップボードにコピーしました。');
    })
    .catch(err => {
      console.error('コピーに失敗しました: ', err);
      alert('コピーに失敗しました。');
    });
}

// ─── タグ文字列を { kind, text, positive, negative, weight } に分解 ─────────────────
function parseWeight(tag) {
  // 括弧形式 ( {tag}, [[tag]] )
  const curly = tag.match(/^({+)(.*?)(}+)$/);
  const square = tag.match(/^(\[+)(.*?)(\]+)$/);
  if (curly && curly[1].length === curly[3].length) {
    const posCount = curly[1].length;
    return {
      kind: 'bracket',
      text: curly[2],
      positive: posCount,
      negative: 0,
      weight: parseFloat(getWeightValue(posCount, 0))
    };
  }
  if (square && square[1].length === square[3].length) {
    const negCount = square[1].length;
    return {
      kind: 'bracket',
      text: square[2],
      positive: 0,
      negative: negCount,
      weight: parseFloat(getWeightValue(0, negCount))
    };
  }
  // コロン形式 ( 1.10::tag:: )
  const colon = tag.match(/^(\d+(\.\d+)?)::(.+?)::$/);
  if (colon) {
    const w = parseFloat(colon[1]);
    const txt = colon[3];
    let positive = 0, negative = 0;
    if (w > 1.00) {
      positive = getBracketCountFromWeight(w, 'positive');
    } else if (w < 1.00) {
      negative = getBracketCountFromWeight(w, 'negative');
    }
    return { kind: 'colon', text: txt, positive, negative, weight: w };
  }
  // 普通のタグ (weight = 1.00)
  return { kind: 'plain', text: tag, positive: 0, negative: 0, weight: 1.00 };
}

// ─── {text, positive, negative} から括弧形式文字列を生成 ─────────────────────────
function formatBrackets(text, pos, neg) {
  if (pos > 0) return '{'.repeat(pos) + text + '}'.repeat(pos);
  if (neg > 0) return '['.repeat(neg) + text + ']'.repeat(neg);
  return text;
}

// ─── {text, positive, negative} からコロン形式文字列を生成 ─────────────────────────
function formatColon(text, pos, neg) {
  const w = getWeightValue(pos, neg);
  return `${w}::${text}::`;
}

// ─── 現在の bracket レベルに応じた weight 数値を取得 ─────────────────────────
function getWeightValue(pos, neg) {
  const idx = Math.min(20, Math.max(0, pos || neg));
  if (pos > 0) {
    return weightMap.positive[idx].toFixed(2);
  }
  if (neg > 0) {
    return weightMap.negative[idx].toFixed(2);
  }
  return '1.00';
}

// ─── weight 数値から対応する括弧数を逆算（厳密一致） ─────────────────────────
function getBracketCountFromWeight(weight, type = 'positive') {
  const table = weightMap[type];
  for (let i = 0; i < table.length; i++) {
    if (parseFloat(table[i].toFixed(2)) === parseFloat(weight.toFixed(2))) {
      return i;
    }
  }
  return 0;
}

// ─── 各セクションにタグを描画 (base, negative, characters) ─────────────────────
function renderTags(id, targetArray) {
  const container = document.getElementById(id);
  if (!container) return;

  // 既存の Sortable インスタンスがあれば破棄
  if (sortableInstances[id]) {
    sortableInstances[id].destroy();
    delete sortableInstances[id];
  }

  container.innerHTML = ''; // クリア

  targetArray.forEach((rawTag, index) => {
    const parsed = parseWeight(rawTag);
    const text = parsed.text;
    const pos = parsed.positive;
    const neg = parsed.negative;
    const weight = parsed.weight.toFixed(2);

    const tagEl = document.createElement('div');
    tagEl.className = 'tag';
    if (parsed.kind === 'colon') tagEl.classList.add('colon');
    if (pos > 0) tagEl.classList.add('positive');
    if (neg > 0) tagEl.classList.add('negative');

    // ─── ドラッグハンドルを先頭に追加 ───────────────────────────────
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '☰';
    tagEl.appendChild(dragHandle);

    // テキスト編集用 input
    const input = document.createElement('input');
    input.value = text;
    input.onchange = (e) => {
      const newText = e.target.value;
      targetArray[index] = formatBrackets(newText, pos, neg);
      renderAll();
    };
    tagEl.appendChild(input);

    // weight 表示・編集
    const weightSpan = document.createElement('span');
    weightSpan.className = 'weight';
    weightSpan.textContent = weight;
    weightSpan.title = 'クリックで編集';
    weightSpan.onclick = () => {
      weightSpan.classList.add('editing');
      weightInput.style.display = 'inline-block';
      weightInput.focus();
    };
    tagEl.appendChild(weightSpan);

    const weightInput = document.createElement('input');
    weightInput.type = 'text';
    weightInput.className = 'weight-input';
    weightInput.value = weight;
    weightInput.onkeydown = (e) => {
      if (e.key === 'Enter') weightInput.blur();
    };
    weightInput.onblur = () => {
      const val = parseFloat(weightInput.value);
      if (!isNaN(val) && val >= 0.38 && val <= 2.65) {
        const newText = text;
        const newWeight = val.toFixed(2);
        targetArray[index] = `${newWeight}::${newText}::`;
      }
      weightInput.style.display = 'none';
      weightSpan.classList.remove('editing');
      renderAll();
    };
    tagEl.appendChild(weightInput);

    // ＋ボタン（括弧数増加）
    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.onclick = () => {
      if (neg > 0) {
        parsed.negative--;
      } else {
        parsed.positive++;
      }
      targetArray[index] = formatBrackets(text, parsed.positive, parsed.negative);
      renderAll();
    };
    tagEl.appendChild(plusBtn);

    // －ボタン（括弧数減少または抑制増加）
    const minusBtn = document.createElement('button');
    minusBtn.textContent = '-';
    minusBtn.onclick = () => {
      if (pos > 0) {
        parsed.positive--;
      } else {
        parsed.negative++;
      }
      targetArray[index] = formatBrackets(text, parsed.positive, parsed.negative);
      renderAll();
    };
    tagEl.appendChild(minusBtn);

    // ×ボタン（タグ削除）
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      targetArray.splice(index, 1);
      renderAll();
    };
    tagEl.appendChild(removeBtn);

    container.appendChild(tagEl);
  });

  // ─── Sortable.js を再初期化 ───────────────────────────────────────
  sortableInstances[id] = new Sortable(container, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: function (evt) {
      const oldIndex = evt.oldIndex;
      const newIndex = evt.newIndex;
      if (oldIndex === newIndex) return;
      const movedItem = targetArray.splice(oldIndex, 1)[0];
      targetArray.splice(newIndex, 0, movedItem);
      renderAll();
    }
  });
}

// ─── 補完スペース用：チェックボックス付きリストを描画 ─────────────────────────
function renderExtraList() {
  const container = document.getElementById('extra-list');
  if (!container) return;
  container.innerHTML = ''; // クリア

  state.extra.forEach((rawTag, index) => {
    const parsed = parseWeight(rawTag);
    const text = parsed.text;
    const pos = parsed.positive;
    const neg = parsed.negative;
    const formatted = parsed.kind === 'colon'
      ? formatColon(text, pos, neg)
      : formatBrackets(text, pos, neg);

    const item = document.createElement('div');
    item.className = 'extra-item';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = `extra-${index}`;
    chk.value = rawTag;
    item.appendChild(chk);

    const lbl = document.createElement('label');
    lbl.htmlFor = `extra-${index}`;
    lbl.textContent = formatted;
    item.appendChild(lbl);

    container.appendChild(item);
  });
}

// ─── 補完スペース用：読み込み先セレクトにオプションを表示 ────────────────────
function renderExtraTargetOptions() {
  const select = document.getElementById('extra-target');
  if (!select) return;
  select.innerHTML = ''; // クリア

  const opts = ['base'];
  state.characters.forEach((_, idx) => opts.push(`character-${idx}`));
  opts.push('negative');

  opts.forEach(id => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent =
      id === 'base'
        ? 'ベースプロンプト'
        : id.startsWith('character-')
        ? `キャラクタープロンプト ${parseInt(id.split('-')[1], 10) + 1}`
        : 'ネガティブプロンプト';
    select.appendChild(option);
  });
}

// ─── 各セクションの選択肢（左側 target-section）を更新 ───────────────────────────
function renderLeftTargetOptions() {
  const leftSelect = document.getElementById('target-section');
  if (!leftSelect) return;
  leftSelect.innerHTML = ''; // クリア

  const opts = ['base'];
  state.characters.forEach((_, idx) => opts.push(`character-${idx}`));
  opts.push('negative', 'extra');

  opts.forEach(id => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent =
      id === 'base'
        ? 'ベースプロンプト'
        : id === 'negative'
        ? 'ネガティブプロンプト'
        : id === 'extra'
        ? '補完スペース'
        : `キャラクタープロンプト ${parseInt(id.split('-')[1], 10) + 1}`;
    leftSelect.appendChild(option);
  });
}

// ─── 各セクションの「最終プロンプト」表示を更新 ─────────────────────────────
function updateOutputBoxes() {
  document.getElementById('output-base').textContent = state.base.join(', ');
  document.getElementById('output-negative').textContent = state.negative.join(', ');
  state.characters.forEach((set, i) => {
    const elem = document.getElementById(`output-character-${i}`);
    if (elem) elem.textContent = set.join(', ');
  });
}

// ─── 全セクションを再描画し、出力更新 ─────────────────────────────────────
function renderAll() {
  renderTags('base', state.base);
  renderTags('negative', state.negative);
  for (let i = 0; i < state.characters.length; i++) {
    renderTags(`character-${i}`, state.characters[i]);
  }
  renderExtraList();
  renderExtraTargetOptions();
  renderLeftTargetOptions();
  updateOutputBoxes();
  updateTemplateSelect();
}

// ─── 通常タグ読み込み：テキスト入力を各配列に振り分け ─────────────────────────
function loadTags() {
  const input = document.getElementById('tag-input').value;
  const target = document.getElementById('target-section').value;
  const tags = input.split(',').map(t => t.trim()).filter(Boolean);

  const normal = [], negative = [], extra = [];
  tags.forEach(tag => {
    if (tag.startsWith('!')) negative.push(tag.slice(1));
    else if (tag.startsWith('#')) extra.push(tag.slice(1));
    else normal.push(tag);
  });

  if (target.startsWith('character-')) {
    const idx = parseInt(target.split('-')[1], 10);
    if (idx >= state.characters.length) {
      alert('そのキャラクタープロンプト欄は存在しません。キャラクタープロンプト1に戻します。');
      document.getElementById('target-section').value = 'character-0';
      return;
    }
    state.characters[idx].push(...normal);
  } else if (target === 'extra') {
    state.extra.push(...normal);
  } else {
    state[target].push(...normal);
  }

  state.negative.push(...negative);
  state.extra.push(...extra);
  renderAll();
}

// ─── 補完スペースから選択したタグを読み込む ─────────────────────────────────
function loadSelectedExtras() {
  const target = document.getElementById('extra-target').value;
  const items = document.querySelectorAll('#extra-list input[type="checkbox"]:checked');
  if (items.length === 0) {
    alert('読み込みたい補完スペースタグをチェックしてください');
    return;
  }
  items.forEach(chk => {
    const rawTag = chk.value;
    if (target.startsWith('character-')) {
      const idx = parseInt(target.split('-')[1], 10);
      if (idx >= state.characters.length) {
        alert('そのキャラクタープロンプト欄は存在しません。キャラクタープロンプト1に戻します。');
        document.getElementById('extra-target').value = 'character-0';
        return;
      }
      state.characters[idx].push(rawTag);
    } else if (target === 'extra') {
      state.extra.push(rawTag);
    } else {
      state[target].push(rawTag);
    }
    chk.checked = false;
  });
  renderAll();
}

// ─── 補完スペースから選択したタグを削除 ───────────────────────────────────────
function deleteSelectedExtras() {
  const items = document.querySelectorAll('#extra-list input[type="checkbox"]:checked');
  if (items.length === 0) {
    alert('削除したい補完スペースタグをチェックしてください');
    return;
  }
  const toDelete = Array.from(items).map(chk => chk.value);
  state.extra = state.extra.filter(raw => !toDelete.includes(raw));
  renderAll();
}

// ─── 各セクションを一括クリア ───────────────────────────────────────────────
function clearPrompt(type) {
  if (type === 'extra') {
    state.extra = [];
  } else if (type.startsWith('character-')) {
    const idx = parseInt(type.split('-')[1], 10);
    if (!isNaN(idx) && state.characters[idx]) state.characters[idx] = [];
  } else {
    state[type] = [];
  }
  renderAll();
}

// ─── キャラクタープロンプト欄を追加（最大6つまで） ─────────────────────────────────
function addCharacterPrompt() {
  if (state.characters.length >= 6) {
    return alert('キャラクタープロンプトは最大6つまでです。');
  }
  state.characters.push([]);
  resetCharacterSections(state.characters.length);
  renderAll();
}

// ─── キャラクタープロンプト欄を削除 ───────────────────────────────────────────
function removeCharacterPrompt(index) {
  state.characters.splice(index, 1);
  resetCharacterSections(state.characters.length);
  renderAll();
}

// ─── 最初のキャラクタープロンプト（1番目）を初期生成 ──────────────────────────
window.onload = () => {
  resetCharacterSections(1);

  ['target-section', 'extra-target'].forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      ['base', 'character-0', 'negative', 'extra'].forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent =
          id === 'base'
            ? 'ベースプロンプト'
            : id === 'negative'
            ? 'ネガティブプロンプト'
            : id === 'extra'
            ? '補完スペース'
            : 'キャラクタープロンプト 1';
        select.appendChild(option);
      });
    }
  });

  updateTemplateSelect();
  renderAll();
};

// ─── テンプレート管理ロジック ───────────────────────────────────────────
const TEMPLATE_STORAGE_KEY = 'promptTemplates';

function getAllTemplates() {
  const json = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  return json ? JSON.parse(json) : {};
}

function setAllTemplates(obj) {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(obj));
}

function updateTemplateSelect() {
  const select = document.getElementById('template-select');
  if (!select) return;
  const templates = getAllTemplates();
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- テンプレートを選択 --';
  select.appendChild(placeholder);
  Object.keys(templates).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function saveTemplate() {
  const nameInput = document.getElementById('template-name-input');
  const name = nameInput.value.trim();
  if (!name) {
    alert('テンプレート名を入力してください。');
    return;
  }
  const allTemplates = getAllTemplates();
  if (allTemplates[name] && !confirm(`「${name}」はすでに存在します。上書きしますか？`)) {
    return;
  }
  const templateData = {
    base: [...state.base],
    characters: state.characters.map(arr => [...arr]),
    negative: [...state.negative],
    extra: [...state.extra]
  };
  allTemplates[name] = templateData;
  setAllTemplates(allTemplates);
  updateTemplateSelect();
  nameInput.value = '';
  alert(`テンプレート「${name}」を保存しました。`);
}

function loadTemplate() {
  const select = document.getElementById('template-select');
  const name = select.value;
  if (!name) {
    alert('読み込むテンプレートを選択してください。');
    return;
  }
  const allTemplates = getAllTemplates();
  const data = allTemplates[name];
  if (!data) {
    alert(`テンプレート「${name}」が見つかりません。`);
    updateTemplateSelect();
    return;
  }

  state.base = [...data.base];
  state.negative = [...data.negative];
  state.extra = [...data.extra];
  state.characters = data.characters.map(arr => [...arr]);

  resetCharacterSections(state.characters.length);
  renderAll();

  alert(`テンプレート「${name}」を読み込みました。`);
}

function deleteTemplate() {
  const select = document.getElementById('template-select');
  const name = select.value;
  if (!name) {
    alert('削除するテンプレートを選択してください。');
    return;
  }
  if (!confirm(`本当にテンプレート「${name}」を削除しますか？`)) {
    return;
  }
  const allTemplates = getAllTemplates();
  delete allTemplates[name];
  setAllTemplates(allTemplates);
  updateTemplateSelect();
  alert(`テンプレート「${name}」を削除しました。`);
}

function resetCharacterSections(count) {
  const container = document.getElementById('character-sections');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'section';
    div.innerHTML = `
      <div class="section-header">
        <span>キャラクタープロンプト ${i + 1}</span>
        <div class="header-buttons">
          <button onclick="copyPrompt('output-character-${i}')">📋 コピー</button>
          ${i > 0 ? `<button class="remove-button" onclick="removeCharacterPrompt(${i})">削除欄</button>` : ''}
          <button onclick="clearPrompt('character-${i}')">🗑️ 全削除</button>
        </div>
      </div>
      <div id="character-${i}" class="tag-container"></div>
      <div class="prompt-output-box">
        <p id="output-character-${i}"></p>
      </div>
    `;
    container.appendChild(div);
  }
  ['target-section', 'extra-target'].forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '';
      const baseOpts = ['base'];
      for (let idx = 0; idx < state.characters.length; idx++) {
        baseOpts.push(`character-${idx}`);
      }
      baseOpts.push('negative', 'extra');
      baseOpts.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent =
          id === 'base'
            ? 'ベースプロンプト'
            : id === 'negative'
            ? 'ネガティブプロンプト'
            : id === 'extra'
            ? '補完スペース'
            : `キャラクタープロンプト ${parseInt(id.split('-')[1], 10) + 1}`;
        select.appendChild(option);
      });
    }
  });
}

// ─── 録画などでフォーカスが戻ったときに自動で再描画 ─────────────────────────────────
window.addEventListener('focus', () => {
  setTimeout(() => {
    renderAll();
  }, 100);
});
