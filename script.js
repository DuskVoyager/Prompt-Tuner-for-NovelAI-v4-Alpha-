// script.js

// ─── グローバル辞書定義 ─────────────────────────────────────────
let extraDictionary = {};
let extraCategories = [];
let activeCategorySelect = null; // 現在表示中のカテゴリセレクト要素

// ─── データ構造の初期化 ─────────────────────────────────────────
const state = {
  base: [],        // ベースプロンプトのタグ配列
  negative: [],    // ネガティブプロンプトのタグ配列
  extra: [],       // 補完スペースのタグ配列（表示領域）
  characters: [[]] // キャラクタープロンプトを入れる配列（最初は1つの空配列）
};

// ─── weight マップ（括弧数 → 数値）──────────────────────────────
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

// ─── コピー機能：指定ID のテキスト（最終出力）をクリップボードにコピー ───────────
function copyPrompt(elementId, buttonEl = null) {
  const text = document.getElementById(elementId)?.textContent || '';
  if (!text) {
    alert('コピーするテキストがありません。');
    return;
  }
  navigator.clipboard.writeText(text)
    .then(() => {
      if (buttonEl) showCopyTooltip(buttonEl);
    })
    .catch(err => {
      console.error('コピーに失敗しました: ', err);
      alert('コピーに失敗しました。');
    });
}

// ─── 吹き出し（ツールチップ）を表示する関数 ─────────────────────────
function showCopyTooltip(button) {
  const tooltip = document.createElement('div');
  tooltip.textContent = 'コピーしました';
  tooltip.style.position = 'absolute';
  tooltip.style.top = '-24px';
  tooltip.style.left = '50%';
  tooltip.style.transform = 'translateX(-50%)';
  tooltip.style.background = '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '4px 8px';
  tooltip.style.borderRadius = '6px';
  tooltip.style.fontSize = '0.75em';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.style.zIndex = '9999';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.opacity = '0';
  tooltip.style.transition = 'opacity 0.3s';

  button.parentElement.style.position = 'relative';
  button.parentElement.appendChild(tooltip);

  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
  });

  setTimeout(() => {
    tooltip.style.opacity = '0';
    setTimeout(() => tooltip.remove(), 300);
  }, 1800);
}

// ─── タグ文字列を { kind, text, positive, negative, weight } に分解 ─────────────────
function parseWeight(tag) {
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
  const colon = tag.match(/^(\d+(\.\d+)?)::(.+?)::$/);
  if (colon) {
    const w = parseFloat(colon[1]);
    const txt = colon[3];
    return { kind: 'colon', text: txt, positive: 0, negative: 0, weight: w };
  }
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
  container.innerHTML = '';

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

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '☰';
    tagEl.appendChild(dragHandle);

    const input = document.createElement('input');
    input.value = text;
    input.onchange = (e) => {
      const newText = e.target.value;
      targetArray[index] = formatBrackets(newText, pos, neg);
      renderAll();
    };
    tagEl.appendChild(input);

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

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      targetArray.splice(index, 1);
      renderAll();
    };
    tagEl.appendChild(removeBtn);

    container.appendChild(tagEl);
  });

  new Sortable(container, {
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
  container.innerHTML = '';

  state.extra.forEach((rawTag, index) => {
    const parsed = parseWeight(rawTag);
    const tagName = parsed.text;
    const pos = parsed.positive;
    const neg = parsed.negative;
    const formatted = parsed.kind === 'colon'
      ? formatColon(tagName, pos, neg)
      : formatBrackets(tagName, pos, neg);

    const item = document.createElement('div');
    item.className = 'extra-item';

    // チェックボックス
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = `extra-${index}`;
    chk.value = rawTag;
    item.appendChild(chk);

    // ラベル（削除済なら灰色表示）
    const lbl = document.createElement('label');
    lbl.htmlFor = `extra-${index}`;
    lbl.textContent = formatted;
    if (!extraDictionary.hasOwnProperty(tagName)) {
      lbl.style.color = '#aaa'; // 灰色
      lbl.title = '辞書から削除済み';
    }
    item.appendChild(lbl);

    // 辞書に存在する場合のみカテゴリと説明を表示
    const info = extraDictionary[tagName];
    if (info) {
      const categoryText = info.category || '未分類';
      const categorySpan = document.createElement('span');
      categorySpan.textContent = `[${categoryText}]`;
      categorySpan.style.marginLeft = '0.5em';
      categorySpan.style.fontSize = '0.75em';
      categorySpan.style.cursor = 'default';
      categorySpan.classList.add('category-label');
      // categorySpan.onclick = () => enterCategoryEdit(tagName, categorySpan);
      item.appendChild(categorySpan);

      const meta = document.createElement('div');
    meta.classList.add('description-meta');
      meta.style.fontSize = '0.75em';
      meta.style.color = '#666';
      meta.style.marginLeft = '1.5em';
      meta.innerText = info.description || '';
      
    // 説明（description）編集可能
    if (info) {
      const descSpan = document.createElement('span');
    descSpan.classList.add('description-text');
      descSpan.textContent = info.description ? info.description + " ✏️" : "✏️";
      descSpan.style.marginLeft = '0.5em';
      descSpan.style.fontSize = '0.75em';
      descSpan.style.color = '#333';
      descSpan.style.cursor = 'pointer';
      descSpan.title = 'クリックして編集';
      descSpan.onclick = () => enterDescriptionEdit(tagName, descSpan);
      item.appendChild(descSpan);
    }

    item.appendChild(meta);
    }

    container.appendChild(item);
  });
}

// ─── カテゴリセレクトを再描画 ───────────────────────────────────────
function renderCategorySelect() {
  const select = document.getElementById('category-select');
  if (!select) return;
  select.innerHTML = '<option value="">-- カテゴリを選択 --</option>';
  extraCategories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

// ─── Bulkカテゴリセレクトを再描画 ─────────────────────────────────────
function renderBulkCategorySelect() {
  const select = document.getElementById('bulk-category-select');
  if (!select) return;
  select.innerHTML = '<option value="">カテゴリを選択</option>';
  extraCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

// ─── カテゴリ編集時に表示される <select> を生成・処理 ───────────────────
function enterCategoryEdit(tagName, spanEl) {
  // 既に別のセレクトが開かれていたら閉じる
  if (activeCategorySelect) {
    activeCategorySelect.dispatchEvent(new Event('blur'));
  }

  const parent = spanEl.parentElement;
  const current = (extraDictionary[tagName]?.category) || '';
  const select = document.createElement('select');
  select.style.fontSize = '0.75em';
  select.style.marginLeft = '0.5em';

  // 選択肢に既存カテゴリを追加
  extraCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === current) opt.selected = true;
    select.appendChild(opt);
  });

  // 選択変更時に辞書を更新して描画
  select.onchange = () => {
    if (!extraDictionary[tagName]) {
      extraDictionary[tagName] = { description: "", category: "" };
    }
    extraDictionary[tagName].category = select.value;
    localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
    updateCategories();
    renderAll();
  };

  // セレクト外クリックで閉じる処理
  const onClickOutside = (event) => {
    if (select && !select.contains(event.target)) {
      const chosen = select.value;
      if (!extraDictionary[tagName]) {
        extraDictionary[tagName] = { description: "", category: "" };
      }
      extraDictionary[tagName].category = chosen;
      localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
      updateCategories();

      const newSpan = document.createElement('span');
      const displayText = chosen || '未分類';
      newSpan.textContent = `[${displayText}]`;
      newSpan.style.marginLeft = '0.5em';
      newSpan.style.fontSize = '0.75em';
      newSpan.style.cursor = 'pointer';
      newSpan.classList.add('category-label');
      newSpan.onclick = () => enterCategoryEdit(tagName, newSpan);

      parent.replaceChild(newSpan, select);
      document.removeEventListener('click', onClickOutside);
      activeCategorySelect = null;
      renderAll();
    }
  };

  parent.replaceChild(select, spanEl);
  select.focus();
  activeCategorySelect = select;
  setTimeout(() => {
    document.addEventListener('click', onClickOutside);
  }, 0);
}

// ─── 補完スペース用：読み込み先セレクトにオプションを表示 ────────────────────
function renderExtraTargetOptions() {
  const select = document.getElementById('extra-target');
  if (!select) return;
  select.innerHTML = '';

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
  leftSelect.innerHTML = '';

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
  renderCategorySelect();
  renderBulkCategorySelect();
}

// ─── タグ読み込み：テキスト入力を各配列に振り分けし、括弧やコロンを数値形式に変換 ─────────────────
function loadTags() {
  const input = document.getElementById('tag-input').value;
  const target = document.getElementById('target-section').value;
  const tags = input.split(',').map(t => t.trim()).filter(Boolean);

  const normal = [], negativeArr = [], extraArr = [];
  tags.forEach(tag => {
    if (tag.startsWith('!')) negativeArr.push(tag.slice(1));
    else if (tag.startsWith('#')) extraArr.push(tag.slice(1));
    else normal.push(tag);
  });

  // 辞書用に「括弧を取り除いて中身だけ」を抽出
  const stripBrackets = (tag) => parseWeight(tag).text;

  // 補完スペース用：中身だけ
  const cleanedExtra = extraArr.map(stripBrackets);

  // 辞書登録：target === 'extra' のときは中身だけ辞書に登録
  if (target === 'extra') {
    normal.map(stripBrackets).forEach(tag => {
      if (!Object.prototype.hasOwnProperty.call(extraDictionary, tag)) {
        extraDictionary[tag] = { description: "", category: "" };
      }
    });
  }
  // #プレフィックスタグも中身だけ登録
  cleanedExtra.forEach(tag => {
    if (!Object.prototype.hasOwnProperty.call(extraDictionary, tag)) {
      extraDictionary[tag] = { description: "", category: "" };
    }
  });

  // localStorage に保存
  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();

  // ====================
  // ここから「括弧やコロンを数値形式に変換」して各配列へ push
  // ====================

  // 変換関数：parseWeight して
  // - weight = 1.00 → プレーンテキスト（括弧やコロン削除）
  // - parsed.kind==='colon' → コロン形式で再構築
  // - 括弧形式の weight と一致すれば括弧形式
  // - それ以外はコロン形式
  const buildFormattedTags = (tagList) =>
    tagList.map(tag => {
      const parsed = parseWeight(tag);
      const w = parsed.weight.toFixed(2);

      // weight=1.00 の場合はプレーンテキスト
      if (w === '1.00') {
        return parsed.text;
      }

      // 入力がコロン形式だったらそのままコロン形式に再構築
      if (parsed.kind === 'colon') {
        return `${w}::${parsed.text}::`;
      }

      // weightMap と一致する括弧数かチェック
      const posIdx = weightMap.positive.findIndex(val => val.toFixed(2) === w);
      const negIdx = weightMap.negative.findIndex(val => val.toFixed(2) === w);

      if (posIdx >= 0 && parsed.positive === posIdx) {
        // 括弧形式を保持
        return formatBrackets(parsed.text, parsed.positive, 0);
      }
      if (negIdx >= 0 && parsed.negative === negIdx) {
        // 括弧形式を保持
        return formatBrackets(parsed.text, 0, parsed.negative);
      }

      // それ以外 → コロン形式
      return `${w}::${parsed.text}::`;
    });

  if (target.startsWith('character-')) {
    const idx = parseInt(target.split('-')[1], 10);
    if (idx >= state.characters.length) {
      alert('そのキャラクタープロンプト欄は存在しません。キャラクタープロンプト1に戻します。');
      document.getElementById('target-section').value = 'character-0';
      return;
    }
    // normal を変換して格納
    const formattedNormal = buildFormattedTags(normal);
    state.characters[idx].push(...formattedNormal);
  } else if (target === 'extra') {
    // 補完スペースは「中身だけ」を push
    const cleanedNormal = normal.map(stripBrackets);
    state.extra.push(...cleanedNormal);
  } else {
    // base または negative 以外（ただし main では base/negative）
    const formattedNormal = buildFormattedTags(normal);
    state[target].push(...formattedNormal);
  }

  // ネガティブは同様に変換して push
  const formattedNegative = buildFormattedTags(negativeArr);
  state.negative.push(...formattedNegative);

  // 補完スペースにも中身だけを追加
  state.extra.push(...cleanedExtra);

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

// ─── 補完スペースから選択したタグを削除（辞書からも完全削除） ────────────────────────────────
function deleteSelectedExtras() {
  const items = document.querySelectorAll('#extra-list input[type="checkbox"]:checked');
  if (items.length === 0) {
    alert('辞書から削除したいタグにチェックを入れてください');
    return;
  }

  if (!confirm('選択されたタグを辞書（extraDictionary）および補完スペースから削除します。元に戻せません。よろしいですか？')) return;

  // 削除するタグ名を抽出
  const toDelete = Array.from(items).map(chk => parseWeight(chk.value).text);

  // 辞書から削除
  toDelete.forEach(tagName => {
    delete extraDictionary[tagName];
  });

  // 補完スペースからも削除
  state.extra = state.extra.filter(tag => {
    const parsed = parseWeight(tag);
    return !toDelete.includes(parsed.text);
  });

  // localStorage 上書き保存
  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));

  // カテゴリ更新と再描画
  updateCategories();
  renderAll();
}

// ─── タグ検索：辞書に部分一致するタグを state.extra に反映 ─────────────────────
function searchTags() {
  const query = document.getElementById('tag-search-input').value.trim().toLowerCase();
  if (!query) {
    state.extra = Object.keys(extraDictionary);
  } else {
    state.extra = Object.keys(extraDictionary).filter(tagName => {
      const info = extraDictionary[tagName];
      return (
        tagName.toLowerCase().includes(query) ||
        (info.description && info.description.toLowerCase().includes(query)) ||
        (info.category && info.category.toLowerCase().includes(query))
      );
    });
  }
  renderExtraList();
}

// ─── カテゴリ一覧を再集計 ───────────────────────────────────────────────
function updateCategories() {
  extraCategories = [...new Set(
    Object.values(extraDictionary)
      .map(d => d.category)
      .filter(c => c)
  )];
}

// ─── 新規カテゴリ作成 ─────────────────────────────────────────────────────
function createCategory() {
  const input = document.getElementById('new-category-input');
  const name = input.value.trim();
  if (!name) {
    alert('カテゴリ名を入力してください。');
    return;
  }

  if (extraCategories.includes(name)) {
    alert('そのカテゴリは既に存在します。');
    return;
  }

  // 未使用カテゴリがすでに存在しているかチェック
  const unused = extraCategories.filter(cat => {
    return !Object.values(extraDictionary).some(d => d.category === cat);
  });
  if (unused.length > 0) {
    alert(`未使用のカテゴリ「${unused[0]}」があります。まずそれを使用してください。`);
    return;
  }

  extraCategories.push(name);
  input.value = '';
  alert(`カテゴリ「${name}」を追加しました。`);
  renderAll();
}

// ─── カテゴリ削除（使用中でも未分類にして削除） ─────────────────────────────────
function deleteCategory() {
  const select = document.getElementById('category-select');
  const target = select.value;
  if (!target) return;

  const confirmMsg = `カテゴリ「${target}」は使用中のタグにも設定されています。\nこのカテゴリを削除し、該当タグのカテゴリを「未分類」に変更しますか？`;
  if (!confirm(confirmMsg)) return;

  // 該当するタグのカテゴリを空文字に（未分類扱い）
  Object.keys(extraDictionary).forEach(tag => {
    if (extraDictionary[tag].category === target) {
      extraDictionary[tag].category = "";
    }
  });

  // カテゴリリストから削除
  extraCategories = extraCategories.filter(cat => cat !== target);

  // 保存と再描画
  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();
  renderAll();

  alert(`カテゴリ「${target}」を削除し、関連タグは未分類に変更されました。`);
}

// ─── Bulk一括カテゴリ設定 ─────────────────────────────────────────────────
function applyBulkCategory() {
  const selected = document.getElementById('bulk-category-select').value;
  if (!selected) {
    alert('カテゴリを選択してください');
    return;
  }

  const checkboxes = document.querySelectorAll('#extra-list input[type="checkbox"]:checked');
  if (checkboxes.length === 0) {
    alert('カテゴリを設定したいタグにチェックを入れてください');
    return;
  }

  checkboxes.forEach(chk => {
    const rawTag = chk.value;
    const parsed = parseWeight(rawTag);
    const name = parsed.text;
    if (!extraDictionary[name]) {
      extraDictionary[name] = { description: "", category: "" };
    }
    extraDictionary[name].category = selected;
  });

  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();
  renderAll();
}

// ─── 一括チェックトグル ───────────────────────────────────────────────
function toggleBulkCheck() {
  const checked = document.getElementById('bulk-check-toggle').checked;
  const checkboxes = document.querySelectorAll('#extra-list input[type="checkbox"]');
  checkboxes.forEach(chk => {
    chk.checked = checked;
  });
}

// ─── 最初のキャラクタープロンプト（1番目）を初期生成 ──────────────────────────
window.onload = () => {
  // 辞書を localStorage から復元
  const savedDict = localStorage.getItem('extraDictionary');
  if (savedDict) {
    extraDictionary = JSON.parse(savedDict);
    state.extra = Object.keys(extraDictionary);
  }
  updateCategories();

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

// 保存キー名
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

// ─── キャラクタープロンプト欄をリセットして再生成 ─────────────────────────
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
          <button onclick="copyPrompt('output-character-${i}', this)">📋 コピー</button>
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

function removeCharacterPrompt(index) {
  state.characters.splice(index, 1);
  resetCharacterSections(state.characters.length);
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

// ─── キャラクタープロンプト追加機能（最大6つまで） ───────────────────────────
function addCharacterPrompt() {
  if (state.characters.length >= 6) {
    alert('キャラクタープロンプトは最大6つまでです。');
    return;
  }
  state.characters.push([]);
  resetCharacterSections(state.characters.length);
  renderAll();
}


// ─── 📁 辞書インポート機能 ─────────────────────────────────────────────

function importDictionaryFromFile() {
  const input = document.getElementById('dict-file-input');
  if (!input.files.length) {
    alert('辞書ファイルを選択してください。');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    importDictionaryFromText(e.target.result);
  };
  reader.readAsText(input.files[0]);
}

function importDictionaryFromText(text) {
  const lines = text.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // タブ、半角複数スペース、全角スペースに対応
    const parts = line.split(/[\t\u3000]+| {2,}/);
    const tag = parts[0]?.trim();
    const desc = parts[1]?.trim() || '';
    const cat = parts[2]?.trim() || '';

    if (!tag) continue;
    extraDictionary[tag] = { description: desc, category: cat };
  }

  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();
  state.extra = Object.keys(extraDictionary);
  renderAll();
}


// ─── 和訳（description）編集用関数 ─────────────────────────────────────
function enterDescriptionEdit(tagName, spanEl) {
  const parent = spanEl.parentElement;
  const current = (extraDictionary[tagName]?.description) || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.style.fontSize = '0.75em';
  input.style.marginLeft = '0.5em';
  input.style.width = '60%';

  input.onkeydown = (e) => {
    if (e.key === "Enter") input.blur();
  };

  input.onblur = () => {
    if (!extraDictionary[tagName]) {
      extraDictionary[tagName] = { description: "", category: "" };
    }
    extraDictionary[tagName].description = input.value.trim();
    localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
    renderAll();
  };

  parent.replaceChild(input, spanEl);
  input.focus();
}


// 📤 表示中の辞書タグを整形してテキストファイルとしてエクスポートする
function exportVisibleDictionaryAligned() {
  const header = "タグ名               和訳                     カテゴリ";
  const lines = [header];

  for (const tag of state.extra) {
    const info = extraDictionary[tag] || {};
    const desc = info.description || "";
    const cat = info.category || "";
    const line = `${tag.padEnd(20)}${desc.padEnd(25)}${cat}`;
    lines.push(line);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = "辞書ファイル.txt";
  link.click();
  URL.revokeObjectURL(url);
}

// モバイル用の開閉トグル機能
const sbToggle = document.getElementById("sidebar-toggle");
const seToggle = document.getElementById("search-extra-toggle");

if (sbToggle) {
  sbToggle.onclick = () => {
    document.body.classList.toggle("sidebar-open");
  };
}
if (seToggle) {
  seToggle.onclick = () => {
    document.body.classList.toggle("search-extra-open");
  };
}
