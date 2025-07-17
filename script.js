// script.js - プロンプト調整器のJavaScript機能定義（辞書・UI操作など）

let extraDictionary = {};
let extraCategories = [];
let activeCategorySelect = null; // 現在表示中のカテゴリセレクト要素


const state = {
  base: [],        // ベースプロンプトのタグ配列
  negative: [],    // ネガティブプロンプトのタグ配列
  extra: [],       // 補完スペースのタグ配列（表示領域）
  characters: [[]] // キャラクタープロンプトを入れる配列（最初は1つの空配列）
};


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


const themeToggleBtn = document.getElementById('theme-toggle');
themeToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  themeToggleBtn.textContent = document.body.classList.contains('dark-mode')
    ? '☀️ ライトモード'
    : '🌙 ダークモード';
});


// 📋 指定IDのテキストをクリップボードにコピーする
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


// 💬 コピー時に一時的なツールチップを表示する
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

// 🧱 括弧形式のタグ文字列を生成する
function formatBrackets(text, pos, neg) {
  if (pos > 0) return '{'.repeat(pos) + text + '}'.repeat(pos);
  if (neg > 0) return '['.repeat(neg) + text + ']'.repeat(neg);
  return text;
}

// 🧱 コロン形式のタグ文字列を生成する
function formatColon(text, pos, neg) {
  const w = getWeightValue(pos, neg);
  return `${w}::${text}::`;
}

// 🎚️ 括弧の数に応じた重み数値を取得する
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

// ↩️ 重みから括弧の数を逆算する
function getBracketCountFromWeight(weight, type = 'positive') {
  const table = weightMap[type];
  for (let i = 0; i < table.length; i++) {
    if (parseFloat(table[i].toFixed(2)) === parseFloat(weight.toFixed(2))) {
      return i;
    }
  }
  return 0;
}


// 🖼️ 指定セクションにタグ要素を描画する（ドラッグ・編集・削除対応）
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

    // タグ名＋和訳ラベルのグループ
    const labelGroup = document.createElement('div');
    labelGroup.className = 'tag-label-group';

    const input = document.createElement('input');
    input.value = text;
    input.onchange = (e) => {
      const newText = e.target.value;
      targetArray[index] = formatBrackets(newText, pos, neg);
      renderAll();
    };
    labelGroup.appendChild(input);

    const info = extraDictionary[text];
    if (info && info.description) {
      const desc = document.createElement('div');
      desc.className = 'description-text';
      desc.textContent = info.description;
      labelGroup.appendChild(desc);
    }

    tagEl.appendChild(labelGroup);

    // weight + ボタン行（footer）
    const weightSpan = document.createElement('span');
    weightSpan.className = 'weight';
    weightSpan.textContent = weight;
    weightSpan.title = 'クリックで編集';
    weightSpan.onclick = () => {
      // ✅ 表示モード非表示 → 入力モードへ
      weightSpan.classList.add('editing');
      weightSpan.style.display = 'none';
      weightInput.classList.add('editing');
      weightInput.style.display = 'block';
      weightInput.focus();
    };

    const weightInput = document.createElement('input');
    weightInput.type = 'text';
    weightInput.className = 'weight-input';
    weightInput.value = weight;
    weightInput.onkeydown = (e) => {
      if (e.key === 'Enter') weightInput.blur();
    };
    weightInput.onblur = () => {
      const val = parseFloat(weightInput.value);
      if (!isNaN(val)) {
        const newWeight = val.toFixed(2);
        const newText = input.value.trim();

        // ✅ 出力形式に応じて再構築（NovelAI / Stable）
        const format = document.getElementById('format-toggle')?.value || 'novelai';
        let newTag = '';

        if (format === 'stable') {
          newTag = `(${newText}:${newWeight})`;
        } else {
          newTag = `${newWeight}::${newText}::`;
        }

        const parsed = parseWeight(newTag);
        const kind = parsed.kind;

        if (kind === 'colon') {
          targetArray[index] = newTag;
        } else if (kind === 'bracket') {
          if (newWeight >= 0.38 && newWeight <= 2.65) {
            targetArray[index] = newTag;
          } else {
            weightInput.value = parsed.weight.toFixed(2);
          }
        }
      }

      // ✅ 入力モード非表示 → 表示モードに戻す
      weightSpan.classList.remove('editing');
      weightSpan.style.display = 'block';
      weightInput.classList.remove('editing');
      weightInput.style.display = 'none';
      renderAll();
    };

// ✅ wrapper に包む
const weightWrapper = document.createElement('div');
weightWrapper.className = 'weight-wrapper';
weightWrapper.appendChild(weightSpan);
weightWrapper.appendChild(weightInput);

// ➕➖✖ ボタン
const plusBtn = document.createElement('button');
plusBtn.textContent = '+';
plusBtn.onclick = () => {
  if (neg > 0) parsed.negative--;
  else parsed.positive++;
  targetArray[index] = formatBrackets(text, parsed.positive, parsed.negative);
  renderAll();
};

const minusBtn = document.createElement('button');
minusBtn.textContent = '-';
minusBtn.onclick = () => {
  if (pos > 0) parsed.positive--;
  else parsed.negative++;
  targetArray[index] = formatBrackets(text, parsed.positive, parsed.negative);
  renderAll();
};

const removeBtn = document.createElement('button');
removeBtn.textContent = '×';
removeBtn.onclick = () => {
  targetArray.splice(index, 1);
  renderAll();
};

// 🎯 ボタンをグループ化してラップする
const buttonGroup = document.createElement('div');
buttonGroup.className = 'button-group';
buttonGroup.appendChild(plusBtn);
buttonGroup.appendChild(minusBtn);
buttonGroup.appendChild(removeBtn);

// footerにまとめて追加
const footer = document.createElement('div');
footer.className = 'tag-footer';
footer.appendChild(weightWrapper);
footer.appendChild(buttonGroup);

tagEl.appendChild(footer);
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

// 🗂️ 補完スペースのタグ一覧を描画（チェックボックス付き）
function renderExtraList() {
  const container = document.getElementById('extra-list');
  if (!container) return;

  container.className = 'extra-list';
  container.style = ''; // スタイルリセット（CSS側に任せる）
  container.innerHTML = '';

  extraData.forEach((tag) => {
    const item = document.createElement('div');
    item.className = 'extra-item';
    item.setAttribute('data-tag', tag.name);

    const labelWrapper = document.createElement('div');
    labelWrapper.className = 'extra-label-wrapper';

    const lbl = document.createElement('label');
    lbl.textContent = tag.name;
    lbl.style.fontWeight = 'bold';

    const categorySpan = document.createElement('span');
    categorySpan.className = 'category-label';
    categorySpan.textContent = tag.category || '';
    categorySpan.style.fontSize = '0.8em';

    const descSpan = document.createElement('span');
    descSpan.className = 'description-text';
    descSpan.textContent = tag.description || '';
    descSpan.style.fontSize = '0.75em';

    labelWrapper.appendChild(lbl);
    if (tag.category) labelWrapper.appendChild(categorySpan);
    if (tag.description) labelWrapper.appendChild(descSpan);
    item.appendChild(labelWrapper);

    item.addEventListener('click', () => {
      addTag(tag.name);
    });

    container.appendChild(item);
  });
}


// 📑 カテゴリ選択UIを更新する
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


// 📑 一括カテゴリ選択UIを更新する
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


// 📝 タグのカテゴリを編集可能にする（セレクトUI表示）
function enterCategoryEdit(tagName, spanEl) {

  if (activeCategorySelect) {
    activeCategorySelect.dispatchEvent(new Event('blur'));
  }

  const parent = spanEl.parentElement;
  const current = (extraDictionary[tagName]?.category) || '';
  const select = document.createElement('select');
  select.style.fontSize = '0.75em';
  select.style.marginLeft = '0.5em';

  extraCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === current) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = () => {
    if (!extraDictionary[tagName]) {
      extraDictionary[tagName] = { description: "", category: "" };
    }
    extraDictionary[tagName].category = select.value;
    localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
    updateCategories();
    renderAll();
  };

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


// 🎯 補完スペース読み込み先セレクトを描画
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


// 🎯 タグ読み込み元セレクトを描画（左側）
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

// 🔁 全UIを再描画して最新状態に同期する
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


// 📥 テキストボックスからタグを読み込んで各セクションに振り分ける（括弧除去・Stable対応）
function loadTags() {
  const input = document.getElementById('tag-input').value;
  const target = document.getElementById('target-section').value;

  let rawTags = [];

  // ✅ 各パートをカンマで区切って処理（部分ごとに括弧チェック）
  input.split(',').forEach(part => {
    const trimmed = part.trim();

    // ✅ Stable形式 (tag:1.25) はそのまま扱う
    if (/^\(.+?:[\d.]+\)$/.test(trimmed)) {
      rawTags.push(trimmed);
      return;
    }

    // ✅ 他の括弧 ({}, [], ()) に囲まれていたら → 括弧を除去 → カンマで再分割
    const m = trimmed.match(/^[\{\[\(](.+)[\}\]\)]$/);
    if (m) {
      rawTags.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
    } else {
      rawTags.push(trimmed);
    }
  });

  // ✅ タグ分類
  const normal = [], negativeArr = [], extraArr = [];
  rawTags.forEach(tag => {
    if (tag.startsWith('!')) negativeArr.push(tag.slice(1));
    else if (tag.startsWith('#')) extraArr.push(tag.slice(1));
    else normal.push(tag);
  });

  // ✅ Stable形式 (tag:1.2) を NovelAI形式に変換
  const convertStableTag = (tag) => {
    const sdMatch = tag.match(/^\((.+?):([\d.]+)\)$/);
    if (sdMatch) {
      const text = sdMatch[1];
      const weight = parseFloat(sdMatch[2]).toFixed(2);
      return `${weight}::${text}::`;
    }
    return tag;
  };

  // ✅ タグ名抽出（括弧・重み除去）
  const stripBrackets = (tag) => parseWeight(convertStableTag(tag)).text;
  const cleanedExtra = extraArr.map(stripBrackets);

  // ✅ extraDictionary に登録
  if (target === 'extra') {
    normal.map(stripBrackets).forEach(tag => {
      if (!Object.prototype.hasOwnProperty.call(extraDictionary, tag)) {
        extraDictionary[tag] = { description: "", category: "" };
      }
    });
  }
  cleanedExtra.forEach(tag => {
    if (!Object.prototype.hasOwnProperty.call(extraDictionary, tag)) {
      extraDictionary[tag] = { description: "", category: "" };
    }
  });

  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();

  // ✅ 統一形式に変換（weightと括弧処理含む）
  const buildFormattedTags = (tagList) =>
    tagList.map(tag => {
      const parsed = parseWeight(convertStableTag(tag));
      const w = parsed.weight.toFixed(2);

      if (w === '1.00') return parsed.text;
      if (parsed.kind === 'colon') return `${w}::${parsed.text}::`;

      const posIdx = weightMap.positive.findIndex(val => val.toFixed(2) === w);
      const negIdx = weightMap.negative.findIndex(val => val.toFixed(2) === w);

      if (posIdx >= 0 && parsed.positive === posIdx) {
        return formatBrackets(parsed.text, parsed.positive, 0);
      }
      if (negIdx >= 0 && parsed.negative === negIdx) {
        return formatBrackets(parsed.text, 0, parsed.negative);
      }

      return `${w}::${parsed.text}::`;
    });

  // ✅ stateに格納
  if (target.startsWith('character-')) {
    const idx = parseInt(target.split('-')[1], 10);
    if (idx >= state.characters.length) {
      alert('そのキャラクタープロンプト欄は存在しません。キャラクタープロンプト1に戻します。');
      document.getElementById('target-section').value = 'character-0';
      return;
    }
    state.characters[idx].push(...buildFormattedTags(normal));
  } else if (target === 'extra') {
    const cleanedNormal = normal.map(stripBrackets);
    state.extra.push(...cleanedNormal);
  } else {
    state[target].push(...buildFormattedTags(normal));
  }

  state.negative.push(...buildFormattedTags(negativeArr));
  state.extra.push(...cleanedExtra);

  renderAll();
}

// ➕ 補完スペースで選択したタグを各欄に読み込む
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


// 🗑️ 補完スペースと辞書からタグを削除する
function deleteSelectedExtras() {
  const items = document.querySelectorAll('#extra-list input[type="checkbox"]:checked');
  if (items.length === 0) {
    alert('辞書から削除したいタグにチェックを入れてください');
    return;
  }

  if (!confirm('選択されたタグを辞書（extraDictionary）および補完スペースから削除します。元に戻せません。よろしいですか？')) return;

  const toDelete = Array.from(items).map(chk => parseWeight(chk.value).text);

  toDelete.forEach(tagName => {
    delete extraDictionary[tagName];
  });

  state.extra = state.extra.filter(tag => {
    const parsed = parseWeight(tag);
    return !toDelete.includes(parsed.text);
  });

  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));

  updateCategories();
  renderAll();
}


// 🔍 タグ検索バーから辞書をフィルタして補完に表示する
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


// 🔃 辞書からカテゴリ一覧を再生成する
function updateCategories() {
  extraCategories = [...new Set(
    Object.values(extraDictionary)
      .map(d => d.category)
      .filter(c => c)
  )];
}


// ➕ 新しいカテゴリを追加する
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


// 🗑️ カテゴリを削除し、該当タグを未分類にする
function deleteCategory() {
  const select = document.getElementById('category-select');
  const target = select.value;
  if (!target) return;

  const confirmMsg = `カテゴリ「${target}」は使用中のタグにも設定されています。\nこのカテゴリを削除し、該当タグのカテゴリを「未分類」に変更しますか？`;
  if (!confirm(confirmMsg)) return;

  Object.keys(extraDictionary).forEach(tag => {
    if (extraDictionary[tag].category === target) {
      extraDictionary[tag].category = "";
    }
  });

  extraCategories = extraCategories.filter(cat => cat !== target);

  localStorage.setItem('extraDictionary', JSON.stringify(extraDictionary));
  updateCategories();
  renderAll();

  alert(`カテゴリ「${target}」を削除し、関連タグは未分類に変更されました。`);
}


// 🧷 一括選択したタグにカテゴリを適用する
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


// ✅ 一括チェックボックス操作（全選択／解除）
function toggleBulkCheck() {
  const checked = document.getElementById('bulk-check-toggle').checked;
  const checkboxes = document.querySelectorAll('#extra-list input[type="checkbox"]');
  checkboxes.forEach(chk => {
    chk.checked = checked;
  });
}


// 🚀 ページ初期化時に辞書とUIを読み込みセットアップ
window.onload = () => {

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

// 📁 ファイルから辞書を読み込む（テキスト形式）
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


// ✏️ 辞書内の和訳をインライン編集可能にする
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

// 📤 表示中の辞書をテキストファイルとして書き出す
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

// 📱 モバイル表示向けのサイドバー切り替えボタン設定
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

tagEl.appendChild(lowerRow);  // 👈 ボタン行の追加

// 👇 この和訳ブロックを"続けて"追加
const info = extraDictionary[text];
if (info && info.description) {
  const desc = document.createElement('div');
  desc.className = 'description-text';
  desc.textContent = info.description;
  tagEl.appendChild(desc);
}


// ===== 🔽 以下は統合済み変更コード 🔽 =====

// ✅ parseWeight - Stable形式対応含む
function parseWeight(tag) {
  // NovelAI: {{{tag}}} → 重み付き括弧
  const curly = tag.match(/^({+)(.*?)(}+)$/);
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

  // NovelAI: [[[tag]]] → ネガティブ強調
  const square = tag.match(/^(\[+)(.*?)(\]+)$/);
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

  // NovelAI: 1.2::tag:: → 重み付きコロン構文
  const colon = tag.match(/^(\d+(\.\d+)?)::(.+?)::$/);
  if (colon) {
    const w = parseFloat(colon[1]);
    const txt = colon[3];
    return { kind: 'colon', text: txt, positive: 0, negative: 0, weight: w };
  }

  // Stable Diffusion: (tag:1.2) → 重み付きStable構文
  const stable = tag.match(/^\((.+?):([\d.]+)\)$/);
  if (stable) {
    const txt = stable[1];
    const w = parseFloat(stable[2]);
    return { kind: 'colon', text: txt, positive: 0, negative: 0, weight: w };
  }

  // プレーンなタグ（weight = 1.00）
  return { kind: 'plain', text: tag, positive: 0, negative: 0, weight: 1.00 };
}

// ✅ updateOutputBoxes - 出力形式切替対応（表示切替方式）
function updateOutputBoxes() {
  const format = document.getElementById('format-toggle')?.value || 'novelai';

  // ベースプロンプト
  const baseNovel = document.getElementById('output-base-novelai');
  const baseStable = document.getElementById('output-base-stable');
  baseNovel.textContent = state.base.map(convertToNovelAIFormat).join(', ');
  baseStable.textContent = state.base.map(convertToStableDiffusionFormat).join(', ');
  baseNovel.style.display = format === 'novelai' ? 'block' : 'none';
  baseStable.style.display = format === 'stable' ? 'block' : 'none';

  // ネガティブプロンプト
  const negNovel = document.getElementById('output-negative-novelai');
  const negStable = document.getElementById('output-negative-stable');
  if (negNovel && negStable) {
    negNovel.textContent = state.negative.map(convertToNovelAIFormat).join(', ');
    negStable.textContent = state.negative.map(convertToStableDiffusionFormat).join(', ');
    negNovel.style.display = format === 'novelai' ? 'block' : 'none';
    negStable.style.display = format === 'stable' ? 'block' : 'none';
  }

  // キャラクタープロンプト（複数対応）
  state.characters.forEach((set, i) => {
    const charNovel = document.getElementById(`output-character-${i}-novelai`);
    const charStable = document.getElementById(`output-character-${i}-stable`);
    if (charNovel && charStable) {
      charNovel.textContent = set.map(convertToNovelAIFormat).join(', ');
      charStable.textContent = set.map(convertToStableDiffusionFormat).join(', ');
      charNovel.style.display = format === 'novelai' ? 'block' : 'none';
      charStable.style.display = format === 'stable' ? 'block' : 'none';
    }
  });
}

// ✅ 追加: Stable形式出力関数
function convertToStableDiffusionFormat(tag) {
  const parsed = parseWeight(tag);
  const text = parsed.text;
  const weight = parsed.weight.toFixed(2);
  if (weight === '1.00') return text;
  return `(${text}:${weight})`;
}

// ✅ 追加: NovelAI形式出力関数
function convertToNovelAIFormat(tag) {
  const parsed = parseWeight(tag);
  const text = parsed.text;
  const weight = parsed.weight.toFixed(2);
  if (weight === '1.00') return text;
  if (parsed.kind === 'colon') return `${weight}::${text}::`;

  const type = parsed.positive > 0 ? 'positive' : 'negative';
  const level = getBracketCountFromWeight(parsed.weight, type);
  const open = parsed.positive > 0 ? '{' : '[';
  const close = parsed.positive > 0 ? '}' : ']';
  return `${open.repeat(level)}${text}${close.repeat(level)}`;
}

// ✅ 出力形式セレクトが変更されたときに出力欄を再描画
document.addEventListener('DOMContentLoaded', () => {
  const formatToggle = document.getElementById('format-toggle');
  if (formatToggle) {
    formatToggle.addEventListener('change', () => {
      updateOutputBoxes();
    });
  }
});

// ♻️ キャラクタープロンプト欄を指定数で初期化（出力欄は末尾に配置）
function resetCharacterSections(count) {
  const container = document.getElementById('character-sections');
  const outputContainer = document.getElementById('character-output-sections');
  container.innerHTML = '';
  outputContainer.innerHTML = '';

  for (let i = 0; i < count; i++) {
    // 🔳 入力UI部分
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
    `;
    container.appendChild(div);

    // 🧾 出力欄は下にまとめて配置（2形式対応）
    const outBox = document.createElement('div');
    outBox.className = 'prompt-output-box';
    outBox.innerHTML = `
      <p id="output-character-${i}-novelai" class="format-output format-novelai"></p>
      <p id="output-character-${i}-stable" class="format-output format-stable" style="display: none;"></p>
    `;
    outputContainer.appendChild(outBox);
  }

  // 🔁 セクション選択ドロップダウンの再構築
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

// ➖ キャラクタープロンプト欄を1つ削除
function removeCharacterPrompt(index) {
  state.characters.splice(index, 1);
  resetCharacterSections(state.characters.length);
  renderAll();
}

// 🧹 指定セクションのタグをすべて削除
function clearPrompt(type) {
  if (type === 'extra') {
    state.extra = [];
  } else if (type.startsWith('character-')) {
    const idx = parseInt(type.split('-')[1], 10);
    if (!isNaN(idx) && state.characters[idx]) {
      state.characters[idx] = [];
    }
  } else {
    state[type] = [];
  }
  renderAll();
}

// ➕ キャラクタープロンプト欄を1つ追加（最大6）
function addCharacterPrompt() {
  if (state.characters.length >= 6) {
    alert('キャラクタープロンプトは最大6つまでです。');
    return;
  }
  state.characters.push([]);
  resetCharacterSections(state.characters.length);
  renderAll();
}

