(function () {
  "use strict";

  const { I18N, LEVELS, DIFFICULTIES, WEAPONS, ATTACHMENTS, SLIDERS } = window.GameData;
  const { labelOf, buildWeaponStats, formatTime } = window.GameRules;

  const app = document.getElementById("app");
  const rotatePrompt = document.getElementById("rotatePrompt");
  let saveData = window.GameStorage.load();
  let sound = new window.SoundEngine(() => saveData.settings);

  const state = {
    screen: "menu",
    levelId: "range",
    difficultyId: "standard",
    weaponId: "rifle",
    useCustom: false,
    customSlot: 0,
    customizeWeaponId: "rifle",
    customizeSlot: 0,
    settingsTab: "audio",
    recordsTab: "formal",
    lastResult: null,
    lastRecordSaved: false,
    toast: "",
    bindingCapture: null,
    activeGame: null,
  };

  function t(key) {
    const lang = saveData.settings.language || "zh";
    return (I18N[lang] && I18N[lang][key]) || key;
  }

  function lang() {
    return saveData.settings.language || "zh";
  }

  function l(value) {
    return labelOf(value, lang());
  }

  function render() {
    document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
    document.body.classList.toggle("playing", state.screen === "game");
    updateStaticI18n();
    if (state.screen === "game") {
      renderGameShell();
      return;
    }
    const content = {
      menu: renderMenu,
      setup: renderSetup,
      tutorial: renderTutorial,
      settings: renderSettings,
      records: renderRecords,
      customize: renderCustomize,
      results: renderResults,
    }[state.screen]();
    app.innerHTML = renderTopbar() + content;
    if (state.screen === "menu") drawHero();
  }

  function updateStaticI18n() {
    rotatePrompt.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  function renderTopbar() {
    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">SG</div>
          <div>
            <h1>${t("title")}</h1>
            <p>${t("subtitle")}</p>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="small ghost" data-action="go-menu">${t("menu")}</button>
          <button class="small ghost" data-action="toggle-language">${lang() === "zh" ? "EN" : "繁中"}</button>
        </div>
      </header>
    `;
  }

  function renderMenu() {
    return `
      <main class="screen">
        <div class="menu-grid">
          <section class="hero-panel">
            <canvas id="heroCanvas" aria-hidden="true"></canvas>
            <div class="hero-copy">
              <h2>${t("title")}</h2>
              <p>${lang() === "zh"
                ? "固定站位，專注瞄準、壓槍、開鏡、換彈與改槍。三個短回合訓練科目已可遊玩。"
                : "Fixed-position shooting focused on aim, recoil control, ADS, reloads, and weapon tuning. Three short training levels are playable."}</p>
            </div>
          </section>
          <section class="card">
            <div class="headline">
              <h2>${lang() === "zh" ? "訓練終端" : "Training Terminal"}</h2>
              <p>${lang() === "zh"
                ? "選擇任務、改槍、測試配置，或查看各關卡與武器的最佳成績。"
                : "Select missions, customize weapons, test configurations, or review best records."}</p>
            </div>
            <div class="menu-actions">
              <button class="primary" data-action="go-setup">${t("start")}</button>
              <button data-action="start-test">${t("testWall")}</button>
              <button data-action="go-settings">${t("settings")}</button>
              <button data-action="go-records">${t("records")}</button>
              <button data-action="toggle-language">${t("language")} · ${lang() === "zh" ? "繁中" : "English"}</button>
            </div>
          </section>
        </div>
      </main>
    `;
  }

  function renderSetup() {
    return `
      <main class="screen">
        <div class="headline">
          <h2>${t("setup")}</h2>
          <p>${lang() === "zh"
            ? "關卡、難度與武器在同一頁完成。你可以使用標準槍保存正式成績，也可以使用自訂配置進入自訂成績。"
            : "Pick level, difficulty, and weapon on one screen. Standard weapons save formal records; custom configs save custom records."}</p>
        </div>
        <section class="grid three">${Object.values(LEVELS).map(levelCard).join("")}</section>
        <section class="grid three" style="margin-top:14px;">${Object.values(DIFFICULTIES).map(difficultyCard).join("")}</section>
        <section class="grid three" style="margin-top:14px;">${Object.values(WEAPONS).map(weaponCard).join("")}</section>
        <section class="card" style="margin-top:14px;">
          <h3>${t("config")}</h3>
          <div class="actions">
            <button class="${!state.useCustom ? "selected" : ""}" data-action="set-config-mode" data-mode="formal">${t("standardWeapon")}</button>
            <button class="${state.useCustom ? "selected" : ""}" data-action="set-config-mode" data-mode="custom">${t("customConfig")}</button>
            ${[0, 1, 2]
              .map(
                (slot) => `
                  <button class="small ${state.useCustom && state.customSlot === slot ? "selected" : ""}" data-action="select-custom-slot" data-slot="${slot}">
                    ${t("slot")} ${slot + 1}
                  </button>
                `,
              )
              .join("")}
            <button class="ghost" data-action="edit-selected-config">${t("customize")}</button>
          </div>
          <div class="meta" style="margin-top:12px;">${renderSelectedStats()}</div>
        </section>
        <div class="actions">
          <button class="primary" data-action="start-game">${t("directStart")}</button>
          <button data-action="go-tutorial">${t("tutorial")}</button>
          <button class="ghost" data-action="go-menu">${t("back")}</button>
        </div>
      </main>
    `;
  }

  function levelCard(level) {
    const selected = state.levelId === level.id ? "selected" : "";
    return `
      <button class="card card-button ${selected}" data-action="select-level" data-level="${level.id}">
        <h3>${level.order}. ${l(level.name)}</h3>
        <p>${l(level.description)}</p>
        <div class="meta" style="margin-top:12px;"><span class="chip">${t("objective")}: ${level.objective}</span></div>
      </button>
    `;
  }

  function difficultyCard(difficulty) {
    const selected = state.difficultyId === difficulty.id ? "selected" : "";
    return `
      <button class="card card-button ${selected}" data-action="select-difficulty" data-difficulty="${difficulty.id}">
        <h3>${l(difficulty.name)}</h3>
        <p>${l(difficulty.description)}</p>
      </button>
    `;
  }

  function weaponCard(weapon) {
    const selected = state.weaponId === weapon.id ? "selected" : "";
    const stats = buildWeaponStats(weapon.id, null, state.difficultyId);
    return `
      <button class="card card-button ${selected}" data-action="select-weapon" data-weapon="${weapon.id}">
        <h3>${l(weapon.name)}</h3>
        <p>${l(weapon.role)}</p>
        ${statBars(stats)}
      </button>
    `;
  }

  function renderSelectedStats() {
    const config = selectedCustomConfig();
    const stats = buildWeaponStats(state.weaponId, state.useCustom ? config : null, state.difficultyId);
    return `
      <span class="chip">${l(WEAPONS[state.weaponId].name)}</span>
      <span class="chip">${state.useCustom ? `${t("customConfig")} ${state.customSlot + 1}` : t("standardWeapon")}</span>
      <span class="chip">${t("ammo")}: ${stats.magSize}+${stats.reserve}</span>
      <span class="chip">${lang() === "zh" ? "射速" : "Fire"}: ${stats.fireRate.toFixed(1)}/s</span>
      <span class="chip">${lang() === "zh" ? "倍率" : "Zoom"}: ${stats.zoom.toFixed(1)}x</span>
    `;
  }

  function statBars(stats) {
    const items = [
      [lang() === "zh" ? "火力" : "Power", stats.damage * 28],
      [lang() === "zh" ? "彈匣" : "Magazine", stats.magSize * 3.5],
      [lang() === "zh" ? "射速" : "Fire Rate", stats.fireRate * 13],
      [lang() === "zh" ? "穩定" : "Stability", 105 - stats.recoil],
    ];
    return `
      <div style="margin-top:14px;">
        ${items
          .map(
            ([name, value]) => `
              <div class="stat-row">
                <label>${name}</label>
                <div class="bar"><span style="--w:${clamp(value, 8, 100)}%"></span></div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderTutorial() {
    const level = LEVELS[state.levelId];
    return `
      <main class="screen compact-screen">
        <section class="card">
          <div class="headline">
            <h2>${t("tutorial")} · ${l(level.name)}</h2>
            <p>${l(level.tutorial)}</p>
          </div>
          <div class="grid two">
            <div class="card">
              <h3>${lang() === "zh" ? "桌面" : "Desktop"}</h3>
              <p>${t("controlsHint")}</p>
            </div>
            <div class="card">
              <h3>${lang() === "zh" ? "手機" : "Mobile"}</h3>
              <p>${t("mobileHint")}</p>
            </div>
          </div>
          <div class="actions">
            <button class="primary" data-action="start-game">${t("directStart")}</button>
            <button class="ghost" data-action="go-setup">${t("back")}</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderCustomize() {
    const config = editingConfig();
    return `
      <main class="screen">
        <div class="headline">
          <h2>${t("customize")}</h2>
          <p>${lang() === "zh"
            ? "每把基礎槍有三個自訂槽。沙盒滑桿可以很誇張，使用自訂配置的關卡只會保存自訂成績。"
            : "Each base weapon has three custom slots. Sandbox sliders can be extreme; custom runs save custom records only."}</p>
        </div>
        <section class="card">
          <div class="actions">
            ${Object.values(WEAPONS)
              .map(
                (weapon) => `
                  <button class="${state.customizeWeaponId === weapon.id ? "selected" : ""}" data-action="customize-weapon" data-weapon="${weapon.id}">
                    ${l(weapon.name)}
                  </button>
                `,
              )
              .join("")}
            ${[0, 1, 2]
              .map(
                (slot) => `
                  <button class="small ${state.customizeSlot === slot ? "selected" : ""}" data-action="customize-slot" data-slot="${slot}">
                    ${t("slot")} ${slot + 1}
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>
        <section class="grid two" style="margin-top:14px;">
          <div class="card">
            <h3>${lang() === "zh" ? "沙盒滑桿" : "Sandbox Sliders"}</h3>
            ${SLIDERS.map((slider) => renderSlider(slider, config.sliders[slider.id])).join("")}
          </div>
          <div class="card">
            <h3>${lang() === "zh" ? "配件" : "Attachments"}</h3>
            ${Object.entries(ATTACHMENTS).map(([slot, items]) => renderAttachment(slot, items, config.attachments[slot])).join("")}
            <h3 style="margin-top:18px;">${lang() === "zh" ? "目前數值" : "Current Stats"}</h3>
            ${statBars(buildWeaponStats(state.customizeWeaponId, config, state.difficultyId))}
          </div>
        </section>
        <div class="actions">
          <button class="primary" data-action="save-custom">${t("save")}</button>
          <button data-action="use-editing-config">${lang() === "zh" ? "套用到任務" : "Use In Mission"}</button>
          <button data-action="start-test-editing">${t("testWall")}</button>
          <button class="ghost" data-action="go-setup">${t("back")}</button>
        </div>
      </main>
    `;
  }

  function renderSlider(slider, value) {
    return `
      <div class="form-row">
        <label>${l(slider.name)} · <strong>${value ?? slider.neutral}%</strong></label>
        <input type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${value ?? slider.neutral}" data-slider="${slider.id}" />
      </div>
    `;
  }

  function renderAttachment(slot, items, value) {
    const slotName = {
      optic: { zh: "瞄準鏡", en: "Optic" },
      muzzle: { zh: "槍口", en: "Muzzle" },
      grip: { zh: "握把", en: "Grip" },
      magazine: { zh: "彈匣", en: "Magazine" },
      stock: { zh: "槍托", en: "Stock" },
      ammoType: { zh: "彈種", en: "Ammo Type" },
    }[slot];
    return `
      <div class="form-row">
        <label>${l(slotName)}</label>
        <select data-attachment="${slot}">
          ${items.map((item) => `<option value="${item.id}" ${item.id === value ? "selected" : ""}>${l(item.name)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  function renderSettings() {
    const tabs = ["audio", "controls", "video", "language", "data"];
    const labels = {
      audio: lang() === "zh" ? "音訊" : "Audio",
      controls: lang() === "zh" ? "控制" : "Controls",
      video: lang() === "zh" ? "畫面" : "Video",
      language: lang() === "zh" ? "語言" : "Language",
      data: lang() === "zh" ? "資料" : "Data",
    };
    return `
      <main class="screen">
        <div class="headline">
          <h2>${t("settings")}</h2>
          <p>${lang() === "zh" ? "調整音量、靈敏度、鍵位、觸控位置、準星與資料。設定會自動保存。" : "Adjust audio, sensitivity, bindings, touch layout, crosshair, and data. Settings save automatically."}</p>
        </div>
        <div class="tabs">
          ${tabs.map((tab) => `<button class="small ${state.settingsTab === tab ? "selected" : ""}" data-action="settings-tab" data-tab="${tab}">${labels[tab]}</button>`).join("")}
        </div>
        <section class="card">${renderSettingsTab()}</section>
        <div class="actions">
          <button class="ghost" data-action="go-menu">${t("back")}</button>
        </div>
      </main>
    `;
  }

  function renderSettingsTab() {
    const s = saveData.settings;
    if (state.settingsTab === "audio") {
      return `
        ${settingRange("masterVolume", lang() === "zh" ? "主音量" : "Master Volume", 0, 1, 0.01, s.masterVolume)}
        ${settingRange("sfxVolume", "SFX", 0, 1, 0.01, s.sfxVolume)}
        ${settingRange("musicVolume", lang() === "zh" ? "音樂" : "Music", 0, 1, 0.01, s.musicVolume)}
      `;
    }
    if (state.settingsTab === "controls") {
      return `
        ${settingRange("mouseSensitivity", lang() === "zh" ? "滑鼠靈敏度" : "Mouse Sensitivity", 0.2, 2.6, 0.05, s.mouseSensitivity)}
        ${settingRange("touchSensitivity", lang() === "zh" ? "觸控靈敏度" : "Touch Sensitivity", 0.2, 2.6, 0.05, s.touchSensitivity)}
        <div class="settings-group">
          <h3>${lang() === "zh" ? "陀螺儀" : "Gyro"}</h3>
          ${settingRange("gyroSensitivity", lang() === "zh" ? "總靈敏度" : "Sensitivity", 0.2, 3.2, 0.05, s.gyroSensitivity)}
          ${settingRange("gyroVerticalSensitivity", lang() === "zh" ? "垂直比例" : "Vertical Ratio", 0.35, 1.5, 0.05, s.gyroVerticalSensitivity)}
          ${settingRange("gyroAdsMultiplier", lang() === "zh" ? "開鏡倍率" : "ADS Multiplier", 0.25, 1, 0.05, s.gyroAdsMultiplier)}
          ${settingRange("gyroSmoothing", lang() === "zh" ? "平滑" : "Smoothing", 0, 0.85, 0.01, s.gyroSmoothing)}
          ${settingRange("gyroDeadzone", lang() === "zh" ? "死區" : "Deadzone", 0, 4, 0.05, s.gyroDeadzone)}
          ${settingRange("gyroAcceleration", lang() === "zh" ? "快速轉動加速" : "Fast Turn Accel", 1, 2.2, 0.05, s.gyroAcceleration)}
        </div>
        <div class="form-row">
          <label><input type="checkbox" data-setting="invertY" ${s.invertY ? "checked" : ""} /> ${lang() === "zh" ? "反轉 Y 軸" : "Invert Y Axis"}</label>
        </div>
        <div class="grid two">
          <div class="card">
            <h3>${lang() === "zh" ? "鍵位" : "Keyboard"}</h3>
            ${bindingRow("reload", t("reload"))}
            ${bindingRow("pause", t("pause"))}
            <div class="actions">
              <button class="small" data-action="preset-right">${lang() === "zh" ? "右手預設" : "Right-handed"}</button>
              <button class="small" data-action="preset-left">${lang() === "zh" ? "左手預設" : "Left-handed"}</button>
            </div>
          </div>
          <div class="card">
            <h3>${lang() === "zh" ? "觸控配置" : "Touch Layout"}</h3>
            ${settingRange("touchSize", lang() === "zh" ? "按鈕大小" : "Button Size", 52, 96, 1, s.touchSize)}
            ${settingRange("touchOpacity", lang() === "zh" ? "按鈕透明度" : "Button Opacity", 0.25, 0.9, 0.01, s.touchOpacity)}
            ${renderTouchEditor()}
            <div class="actions">
              <button class="small" data-action="reset-touch-layout">${t("reset")}</button>
            </div>
          </div>
        </div>
      `;
    }
    if (state.settingsTab === "video") {
      return `
        <div class="form-row">
          <label>${lang() === "zh" ? "準星樣式" : "Crosshair"}</label>
          <select data-setting="crosshair">
            <option value="dot" ${s.crosshair === "dot" ? "selected" : ""}>${lang() === "zh" ? "點" : "Dot"}</option>
            <option value="cross" ${s.crosshair === "cross" ? "selected" : ""}>${lang() === "zh" ? "十字" : "Cross"}</option>
            <option value="ring" ${s.crosshair === "ring" ? "selected" : ""}>${lang() === "zh" ? "圓環" : "Ring"}</option>
          </select>
        </div>
        ${settingToggle("swayEnabled", lang() === "zh" ? "自動晃動" : "Weapon Sway", s.swayEnabled)}
        ${settingToggle("spreadDriftEnabled", lang() === "zh" ? "Spread 漂移" : "Spread Drift", s.spreadDriftEnabled)}
        ${settingToggle("expertBallisticsEnabled", lang() === "zh" ? "第三關風偏 / 下墜" : "Level 3 Wind / Drop", s.expertBallisticsEnabled)}
        ${settingToggle("screenShakeEnabled", lang() === "zh" ? "畫面震動" : "Screen Shake", s.screenShakeEnabled)}
        ${settingRange("screenShake", lang() === "zh" ? "畫面震動" : "Screen Shake", 0, 1, 0.01, s.screenShake)}
        <div class="form-row">
          <label>${lang() === "zh" ? "視覺品質" : "Visual Quality"}</label>
          <select data-setting="quality">
            <option value="low" ${s.quality === "low" ? "selected" : ""}>${lang() === "zh" ? "低" : "Low"}</option>
            <option value="standard" ${s.quality === "standard" ? "selected" : ""}>${lang() === "zh" ? "標準" : "Standard"}</option>
            <option value="high" ${s.quality === "high" ? "selected" : ""}>${lang() === "zh" ? "高" : "High"}</option>
          </select>
        </div>
      `;
    }
    if (state.settingsTab === "language") {
      return `
        <div class="actions">
          <button class="${lang() === "zh" ? "selected" : ""}" data-action="set-language" data-language="zh">繁體中文</button>
          <button class="${lang() === "en" ? "selected" : ""}" data-action="set-language" data-language="en">English</button>
        </div>
      `;
    }
    return `
      <div class="grid three">
        <button class="danger" data-action="reset-records">${lang() === "zh" ? "重設成績" : "Reset Records"}</button>
        <button class="danger" data-action="reset-customs">${lang() === "zh" ? "重設改槍" : "Reset Custom Weapons"}</button>
        <button class="danger" data-action="reset-all">${lang() === "zh" ? "重設全部" : "Reset All"}</button>
      </div>
    `;
  }

  function settingRange(key, label, min, max, step, value) {
    return `
      <div class="form-row">
        <label>${label} · <strong>${formatSettingValue(value)}</strong></label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}" />
      </div>
    `;
  }

  function settingToggle(key, label, value) {
    return `
      <div class="form-row">
        <label><input type="checkbox" data-setting="${key}" ${value !== false ? "checked" : ""} /> ${label}</label>
      </div>
    `;
  }

  function formatSettingValue(value) {
    return Number(value) % 1 === 0 ? String(value) : Number(value).toFixed(2);
  }

  function bindingRow(action, label) {
    const capturing = state.bindingCapture === action;
    return `
      <div class="hud-line" style="margin-bottom:8px;">
        <span>${label}</span>
        <button class="small ${capturing ? "selected" : ""}" data-action="capture-binding" data-binding="${action}">
          ${capturing ? t("bindingHint") : saveData.settings.bindings[action]}
        </button>
      </div>
    `;
  }

  function renderTouchEditor() {
    const layout = saveData.settings.touchLayout;
    const labels = {
      shoot: t("shoot"),
      ads: t("aim"),
      reload: t("reload"),
      gyro: t("gyroscope"),
      pause: t("pause"),
    };
    return `
      <div class="touch-editor" style="position:relative; aspect-ratio:16/9; border:1px solid var(--line); border-radius:8px; background:#141719; overflow:hidden;">
        ${Object.entries(layout)
          .map(
            ([action, pos]) => `
              <button class="small layout-dot" data-layout-action="${action}" style="position:absolute; left:${pos.x}%; top:${pos.y}%; transform:translate(-50%,-50%); min-height:28px; padding:4px 7px;">
                ${labels[action] || action}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderRecords() {
    return `
      <main class="screen">
        <div class="headline">
          <h2>${t("records")}</h2>
          <p>${lang() === "zh" ? "正式成績與自訂成績分開保存，並依關卡、難度與武器分類。" : "Formal and custom records are stored separately by level, difficulty, and weapon."}</p>
        </div>
        <div class="tabs">
          <button class="small ${state.recordsTab === "formal" ? "selected" : ""}" data-action="records-tab" data-tab="formal">${t("formal")}</button>
          <button class="small ${state.recordsTab === "custom" ? "selected" : ""}" data-action="records-tab" data-tab="custom">${t("custom")}</button>
        </div>
        ${state.recordsTab === "formal" ? renderFormalRecords() : renderCustomRecords()}
        <div class="actions"><button class="ghost" data-action="go-menu">${t("back")}</button></div>
      </main>
    `;
  }

  function renderFormalRecords() {
    const rows = Object.entries(saveData.records.formal || {});
    if (!rows.length) return `<section class="card empty">${t("noRecords")}</section>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>${t("level")}</th><th>${t("difficulty")}</th><th>${t("weapon")}</th><th>${t("rating")}</th><th>${t("time")}</th><th>${t("accuracy")}</th><th>${t("weakRate")}</th><th>${t("ammoEfficiency")}</th></tr></thead>
          <tbody>
            ${rows
              .map(([key, record]) => {
                const [levelId, difficultyId, weaponId] = key.split("|");
                return recordRow(record, levelId, difficultyId, weaponId);
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCustomRecords() {
    const rows = Object.entries(saveData.records.custom || {});
    if (!rows.length) return `<section class="card empty">${t("noRecords")}</section>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>${t("level")}</th><th>${t("difficulty")}</th><th>${t("weapon")}</th><th>${t("slot")}</th><th>${t("rating")}</th><th>${t("time")}</th><th>${t("accuracy")}</th><th>${t("weakRate")}</th></tr></thead>
          <tbody>
            ${rows
              .map(([key, record]) => {
                const [levelId, difficultyId, weaponId, slotPart] = key.split("|");
                return recordRow(record, levelId, difficultyId, weaponId, slotPart);
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function recordRow(record, levelId, difficultyId, weaponId, slotPart) {
    return `
      <tr>
        <td>${l(LEVELS[levelId].short)}</td>
        <td>${l(DIFFICULTIES[difficultyId].name)}</td>
        <td>${l(WEAPONS[weaponId].name)}</td>
        ${slotPart ? `<td>${slotPart.replace("slot", "")}</td>` : ""}
        <td>${record.rating}</td>
        <td>${formatTime(record.timeMs)}</td>
        <td>${percent(record.accuracy)}</td>
        <td>${percent(record.weakRate)}</td>
        ${slotPart ? "" : `<td>${percent(record.ammoEfficiency)}</td>`}
      </tr>
    `;
  }

  function renderResults() {
    const result = state.lastResult;
    if (!result) return renderMenu();
    const level = LEVELS[result.levelId];
    const difficulty = DIFFICULTIES[result.difficultyId];
    const weapon = WEAPONS[result.weaponId];
    const reason = result.reasonKey ? t(result.reasonKey) : "";
    return `
      <main class="screen compact-screen">
        <section class="card">
          <div class="headline">
            <h2>${t("result")} · ${result.passed ? t("passed") : t("failed")}</h2>
            <p>${l(level.name)} / ${l(difficulty.name)} / ${l(weapon.name)} ${result.isCustom ? `· ${t("custom")} ${result.customSlot + 1}` : `· ${t("formal")}`}</p>
          </div>
          <div class="grid two">
            <div class="card">
              <h3>${t("rating")}</h3>
              <p style="font-size:4rem; color:${result.passed ? "var(--accent)" : "var(--bad)"}; font-weight:900;">${result.rating}</p>
              <p>${result.passed ? (state.lastRecordSaved ? (lang() === "zh" ? "新最佳成績已保存。" : "New best record saved.") : (lang() === "zh" ? "未超過既有最佳成績。" : "Existing best remains.")) : reason}</p>
            </div>
            <div class="card">
              <h3>${lang() === "zh" ? "訓練指標" : "Training Metrics"}</h3>
              ${metricLine(t("time"), formatTime(result.timeMs))}
              ${metricLine(t("accuracy"), percent(result.accuracy))}
              ${metricLine(t("weakRate"), percent(result.weakRate))}
              ${metricLine(t("ammoEfficiency"), percent(result.ammoEfficiency))}
              ${metricLine(t("avgReaction"), `${(result.avgReaction / 1000).toFixed(2)}s`)}
              ${metricLine(t("objective"), `${result.cleared}/${result.totalTargets}`)}
            </div>
          </div>
          ${!result.passed ? `<section class="card" style="margin-top:14px;"><h3>${lang() === "zh" ? "建議" : "Suggestion"}</h3><p>${failureAdvice(result.reasonKey)}</p></section>` : ""}
          <div class="actions">
            <button class="primary" data-action="retry-last">${t("retry")}</button>
            <button data-action="go-setup">${t("setup")}</button>
            <button class="ghost" data-action="go-menu">${t("menu")}</button>
          </div>
        </section>
      </main>
    `;
  }

  function metricLine(label, value) {
    return `<div class="hud-line"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function failureAdvice(reasonKey) {
    if (reasonKey === "failureAmmo") {
      return lang() === "zh" ? "降低浪射，優先打弱點，並在安全空檔換彈。" : "Reduce wasted shots, prioritize weakpoints, and reload during safe windows.";
    }
    if (reasonKey === "failureBreach") {
      return lang() === "zh" ? "優先處理最近目標，步槍或較大彈匣會更適合防守走廊。" : "Prioritize the nearest targets. Rifle or larger magazines suit the corridor better.";
    }
    return lang() === "zh" ? "重試時調整武器配置或降低難度。" : "Retry with a different weapon setup or lower difficulty.";
  }

  function renderGameShell() {
    const touch = saveData.settings.touchLayout;
    const size = saveData.settings.touchSize;
    const alpha = saveData.settings.touchOpacity;
    app.innerHTML = `
      <div class="game-shell" style="--touch-size:${size}px; --touch-alpha:${alpha};">
        <canvas id="gameCanvas"></canvas>
        <div class="hud">
          <div class="hud-top">
            <div class="hud-panel">
              <strong id="hudLevel"></strong>
              <div class="hud-line"><span>${t("objective")}</span><span id="hudObjective">0</span></div>
              <div class="hud-line"><span>${t("time")}</span><span id="hudTime">0:00</span></div>
              <div class="hud-line"><span>${t("accuracy")}</span><span id="hudAccuracy">100%</span></div>
            </div>
            <div class="hud-panel">
              <strong id="hudWeapon"></strong>
              <div class="hud-line"><span>${t("ammo")}</span><span id="hudAmmo">0</span></div>
              <div class="hud-line"><span>${t("reserve")}</span><span id="hudReserve">0</span></div>
              <div class="hud-line"><span></span><span id="hudMessage"></span></div>
            </div>
          </div>
          <div class="hud-bottom">
            <div class="hint-line">${t("controlsHint")}</div>
          </div>
          <div id="scopeNote" class="scope-note">${t("expertImpact")}</div>
          <div id="gyroIndicator" class="gyro-indicator" aria-hidden="true"><span></span></div>
        </div>
        <button id="mouseLockOverlay" class="mouse-lock-overlay active" type="button" aria-label="${t("lockMouseTitle")}">
          <span>${t("lockMouseTitle")}</span>
          <small>${t("lockMouseBody")}</small>
        </button>
        <div class="touch-controls">
          ${touchButton("shoot", touch.shoot, t("shoot"), "primary-touch")}
          ${touchButton("ads", touch.ads, t("aim"), "")}
          ${touchButton("reload", touch.reload, t("reload"), "")}
          ${touchButton("gyro", touch.gyro, "GYR", "")}
          ${touchButton("pause", touch.pause, "II", "")}
        </div>
        <div id="pausePanel" class="pause-panel">
          <div class="pause-box">
            <h2>${t("pause")}</h2>
            <div class="actions">
              <button class="primary" data-action="resume-game">${t("continue")}</button>
              <button data-action="retry-current">${t("retry")}</button>
              <button data-action="toggle-pause-settings">${t("settings")}</button>
              <button class="ghost" data-action="exit-current">${t("menu")}</button>
            </div>
            <div id="pauseSettings" style="display:none; margin-top:14px;">
              ${settingRange("masterVolume", lang() === "zh" ? "主音量" : "Master Volume", 0, 1, 0.01, saveData.settings.masterVolume)}
              ${settingRange("mouseSensitivity", lang() === "zh" ? "滑鼠靈敏度" : "Mouse Sensitivity", 0.2, 2.6, 0.05, saveData.settings.mouseSensitivity)}
              ${settingRange("touchSensitivity", lang() === "zh" ? "觸控靈敏度" : "Touch Sensitivity", 0.2, 2.6, 0.05, saveData.settings.touchSensitivity)}
              ${settingRange("gyroSensitivity", lang() === "zh" ? "陀螺儀靈敏度" : "Gyro Sensitivity", 0.2, 3.2, 0.05, saveData.settings.gyroSensitivity)}
              ${settingRange("gyroAdsMultiplier", lang() === "zh" ? "陀螺儀開鏡倍率" : "Gyro ADS Multiplier", 0.25, 1, 0.05, saveData.settings.gyroAdsMultiplier)}
              ${settingToggle("swayEnabled", lang() === "zh" ? "自動晃動" : "Weapon Sway", saveData.settings.swayEnabled)}
              ${settingToggle("spreadDriftEnabled", lang() === "zh" ? "Spread 漂移" : "Spread Drift", saveData.settings.spreadDriftEnabled)}
              ${settingToggle("expertBallisticsEnabled", lang() === "zh" ? "第三關風偏 / 下墜" : "Level 3 Wind / Drop", saveData.settings.expertBallisticsEnabled)}
              ${settingToggle("screenShakeEnabled", lang() === "zh" ? "畫面震動" : "Screen Shake", saveData.settings.screenShakeEnabled)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function touchButton(action, pos, label, extraClass) {
    return `
      <button class="touch-button ${extraClass}" data-touch-action="${action}" style="left:${pos.x}%; top:${pos.y}%;" aria-label="${label}">
        ${label}
      </button>
    `;
  }

  function startRun(mode) {
    stopActiveGame();
    state.screen = "game";
    render();
    requestAnimationFrame(() => {
      const customConfig = state.useCustom ? selectedCustomConfig() : null;
      state.activeGame = new window.GameRun({
        canvas: document.getElementById("gameCanvas"),
        settings: saveData.settings,
        lang: lang(),
        levelId: state.levelId,
        difficultyId: state.difficultyId,
        weaponId: state.weaponId,
        customConfig,
        customSlot: state.customSlot,
        isCustom: state.useCustom,
        mode,
        sound,
        onPauseRequest: () => setPause(true),
        onFinish: (result) => finishRun(result),
      });
    });
  }

  function stopActiveGame() {
    if (state.activeGame) {
      state.activeGame.destroy();
      state.activeGame = null;
    }
    sound.stopMusic();
  }

  function setPause(paused) {
    if (!state.activeGame) return;
    state.activeGame.setPaused(paused);
    const panel = document.getElementById("pausePanel");
    if (panel) panel.classList.toggle("active", paused);
  }

  function finishRun(result) {
    if (state.activeGame) {
      state.activeGame.destroy();
      state.activeGame = null;
    }
    sound.stopMusic();
    state.lastResult = result;
    state.lastRecordSaved = false;
    if (result.passed && result.mode !== "test") {
      const record = {
        rating: result.rating,
        score: result.score,
        timeMs: result.timeMs,
        accuracy: result.accuracy,
        weakRate: result.weakRate,
        ammoEfficiency: result.ammoEfficiency,
        avgReaction: result.avgReaction,
        savedAt: new Date().toISOString(),
      };
      const key = result.isCustom
        ? `${result.levelId}|${result.difficultyId}|${result.weaponId}|slot${result.customSlot + 1}`
        : `${result.levelId}|${result.difficultyId}|${result.weaponId}`;
      state.lastRecordSaved = window.GameStorage.recordScore(saveData, result.isCustom ? "custom" : "formal", key, record);
    }
    state.screen = "results";
    render();
  }

  function selectedCustomConfig() {
    return saveData.customConfigs[state.weaponId][state.customSlot];
  }

  function editingConfig() {
    return saveData.customConfigs[state.customizeWeaponId][state.customizeSlot];
  }

  function save() {
    window.GameStorage.save(saveData);
    sound.updateMusicVolume();
  }

  function handleAction(target) {
    const action = target.dataset.action;
    if (!action) return;
    sound.beep("ui");

    if (action === "go-menu") {
      stopActiveGame();
      state.screen = "menu";
      render();
    } else if (action === "go-setup") {
      stopActiveGame();
      state.screen = "setup";
      render();
    } else if (action === "go-settings") {
      stopActiveGame();
      state.screen = "settings";
      render();
    } else if (action === "go-records") {
      stopActiveGame();
      state.screen = "records";
      render();
    } else if (action === "go-tutorial") {
      state.screen = "tutorial";
      render();
    } else if (action === "select-level") {
      state.levelId = target.dataset.level;
      render();
    } else if (action === "select-difficulty") {
      state.difficultyId = target.dataset.difficulty;
      render();
    } else if (action === "select-weapon") {
      state.weaponId = target.dataset.weapon;
      render();
    } else if (action === "set-config-mode") {
      state.useCustom = target.dataset.mode === "custom";
      render();
    } else if (action === "select-custom-slot") {
      state.customSlot = Number(target.dataset.slot);
      state.useCustom = true;
      render();
    } else if (action === "edit-selected-config") {
      state.customizeWeaponId = state.weaponId;
      state.customizeSlot = state.customSlot;
      state.screen = "customize";
      render();
    } else if (action === "start-game") {
      startRun("level");
    } else if (action === "start-test") {
      state.levelId = "range";
      startRun("test");
    } else if (action === "start-test-editing") {
      state.weaponId = state.customizeWeaponId;
      state.customSlot = state.customizeSlot;
      state.useCustom = true;
      startRun("test");
    } else if (action === "customize-weapon") {
      state.customizeWeaponId = target.dataset.weapon;
      render();
    } else if (action === "customize-slot") {
      state.customizeSlot = Number(target.dataset.slot);
      render();
    } else if (action === "save-custom") {
      save();
      showToast(t("saved"));
      render();
    } else if (action === "use-editing-config") {
      state.weaponId = state.customizeWeaponId;
      state.customSlot = state.customizeSlot;
      state.useCustom = true;
      state.screen = "setup";
      save();
      render();
    } else if (action === "settings-tab") {
      state.settingsTab = target.dataset.tab;
      render();
    } else if (action === "records-tab") {
      state.recordsTab = target.dataset.tab;
      render();
    } else if (action === "toggle-language") {
      saveData.settings.language = lang() === "zh" ? "en" : "zh";
      save();
      render();
    } else if (action === "set-language") {
      saveData.settings.language = target.dataset.language;
      save();
      render();
    } else if (action === "capture-binding") {
      state.bindingCapture = target.dataset.binding;
      render();
    } else if (action === "preset-right") {
      saveData.settings.bindings.reload = "KeyR";
      saveData.settings.bindings.pause = "Escape";
      save();
      render();
    } else if (action === "preset-left") {
      saveData.settings.bindings.reload = "KeyU";
      saveData.settings.bindings.pause = "Escape";
      save();
      render();
    } else if (action === "reset-touch-layout") {
      saveData.settings.touchLayout = window.GameStorage.clone(window.GameData.DEFAULT_TOUCH_LAYOUT);
      save();
      render();
    } else if (action === "reset-records") {
      saveData.records = { formal: {}, custom: {} };
      save();
      showToast(t("resetDone"));
      render();
    } else if (action === "reset-customs") {
      const fresh = window.GameStorage.createDefaultSave();
      saveData.customConfigs = fresh.customConfigs;
      save();
      showToast(t("resetDone"));
      render();
    } else if (action === "reset-all") {
      window.GameStorage.clear();
      saveData = window.GameStorage.load();
      showToast(t("resetDone"));
      render();
    } else if (action === "resume-game") {
      setPause(false);
    } else if (action === "retry-current" || action === "retry-last") {
      startRun("level");
    } else if (action === "exit-current") {
      stopActiveGame();
      state.screen = "menu";
      render();
    } else if (action === "toggle-pause-settings") {
      const panel = document.getElementById("pauseSettings");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  }

  function handleInput(target) {
    if (target.dataset.slider) {
      const config = editingConfig();
      config.sliders[target.dataset.slider] = Number(target.value);
      render();
      return;
    }
    if (target.dataset.attachment) {
      const config = editingConfig();
      config.attachments[target.dataset.attachment] = target.value;
      render();
      return;
    }
    if (target.dataset.setting) {
      const key = target.dataset.setting;
      if (target.type === "checkbox") {
        saveData.settings[key] = target.checked;
      } else if (target.type === "range") {
        saveData.settings[key] = Number(target.value);
      } else {
        saveData.settings[key] = target.value;
      }
      save();
      if (state.screen !== "game") render();
    }
  }

  function bindGlobalEvents() {
    app.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (target) handleAction(target);
    });

    app.addEventListener("input", (event) => {
      handleInput(event.target);
    });

    app.addEventListener("change", (event) => {
      handleInput(event.target);
    });

    window.addEventListener("keydown", (event) => {
      if (!state.bindingCapture) return;
      event.preventDefault();
      saveData.settings.bindings[state.bindingCapture] = event.code;
      state.bindingCapture = null;
      save();
      render();
    });

    let draggingLayout = null;
    app.addEventListener("pointerdown", (event) => {
      const dot = event.target.closest("[data-layout-action]");
      if (!dot) return;
      draggingLayout = {
        action: dot.dataset.layoutAction,
        editor: dot.closest(".touch-editor"),
        dot,
      };
      dot.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    app.addEventListener("pointermove", (event) => {
      if (!draggingLayout) return;
      const rect = draggingLayout.editor.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 5, 95);
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 92);
      saveData.settings.touchLayout[draggingLayout.action] = { x, y };
      draggingLayout.dot.style.left = `${x}%`;
      draggingLayout.dot.style.top = `${y}%`;
    });
    app.addEventListener("pointerup", () => {
      if (!draggingLayout) return;
      draggingLayout = null;
      save();
    });
  }

  function showToast(message) {
    state.toast = message;
    window.setTimeout(() => {
      if (state.toast === message) state.toast = "";
    }, 1200);
  }

  function drawHero() {
    const canvas = document.getElementById("heroCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const horizon = h * 0.42;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#41484c");
    grad.addColorStop(0.48, "#2a3034");
    grad.addColorStop(1, "#171a1c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 12; i += 1) {
      const y = horizon + (h - horizon) * (i / 11) ** 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,159,28,0.42)";
    for (let i = -5; i <= 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w / 2, horizon);
      ctx.lineTo(w / 2 + (i * w) / 8, h);
      ctx.stroke();
    }
    drawHeroTarget(ctx, w * 0.68, h * 0.38, 54);
    drawHeroTarget(ctx, w * 0.8, h * 0.56, 34);
    drawHeroTarget(ctx, w * 0.55, h * 0.58, 42);
  }

  function drawHeroTarget(ctx, x, y, r) {
    ctx.fillStyle = "#efe6d5";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d43c2f";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  function percent(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const localFile = window.location.protocol === "file:";
    if (localFile) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }

  bindGlobalEvents();
  registerServiceWorker();
  render();
})();
