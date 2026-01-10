(() => {
  const STORAGE_KEY = "lozrp.sheet.v1";

  /** @type {() => void} */
  let refreshPreview = () => {};

  /** @type {() => void} */
  let syncSpellsUI = () => {};

  /** @type {() => void} */
  let syncActionsUI = () => {};

  /** @type {() => void} */
  let syncInventoryUI = () => {};

  /** @type {() => void} */
  let syncFeaturesUI = () => {};

  /** @type {() => void} */
  let syncPortraitUI = () => {};

  /** @type {() => void} */
  let syncHeartsUI = () => {};

  /** @type {() => void} */
  let syncStaminaUI = () => {};

  /** @type {() => void} */
  let syncHeaderAbilitiesUI = () => {};

  /** @type {HTMLFormElement | null} */
  const formLikeRoot = document.querySelector("main");

  /** @type {HTMLElement | null} */
  const statusEl = document.getElementById("status");

  /** @type {HTMLTextAreaElement | null} */
  const exportPreviewEl = document.getElementById("exportPreview");

  const fieldsSelector = "input[name], select[name], textarea[name]";

  function setStatus(message, kind = "info") {
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.dataset.kind = kind;

    window.clearTimeout(setStatus._t);
    setStatus._t = window.setTimeout(() => {
      statusEl.textContent = "";
      delete statusEl.dataset.kind;
    }, 2500);
  }
  setStatus._t = 0;

  function getAllFields() {
    if (!formLikeRoot) return [];
    return Array.from(formLikeRoot.querySelectorAll(fieldsSelector));
  }

  function readSheet() {
    const data = {};
    for (const el of getAllFields()) {
      const name = el.getAttribute("name");
      if (!name) continue;
      if (name === "exportPreview") continue;
      data[name] = el.value;
    }
    return data;
  }

  function writeSheet(data) {
    for (const el of getAllFields()) {
      const name = el.getAttribute("name");
      if (!name) continue;
      if (name === "exportPreview") continue;
      el.value = data?.[name] ?? "";
    }
  }

  function toInt(value) {
    const n = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createJsonListManager({
    dataEl,
    listEl,
    addBtn,
    addLabel,
    saveLabel,
    emptyMessage,
    builder,
    normalizeItem,
    renderCard,
    filterItem,
    onEditItem,
    legacyParse,
  }) {
    /** @type {number | null} */
    let editingIndex = null;

    const read = () => {
      const raw = (dataEl?.value ?? "").trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through
      }
      return legacyParse ? legacyParse(raw) : [];
    };

    const write = (items) => {
      if (!dataEl) return;
      dataEl.value = JSON.stringify(items, null, 2);
    };

    const clearBuilder = () => {
      for (const key of Object.keys(builder)) {
        const input = builder[key];
        if (input) input.value = "";
      }
    };

    const setEditing = (idx, item) => {
      editingIndex = idx;
      for (const key of Object.keys(builder)) {
        const input = builder[key];
        if (!input) continue;
        input.value = item?.[key] ?? "";
      }
      if (addBtn) addBtn.textContent = saveLabel;
    };

    const stopEditing = () => {
      editingIndex = null;
      if (addBtn) addBtn.textContent = addLabel;
    };

    const render = () => {
      if (!listEl) return;
      listEl.innerHTML = "";
      const items = read();

      if (!items.length) {
        listEl.appendChild(el("div", "spell-muted", emptyMessage));
        return;
      }

      const visible = [];
      items.forEach((rawItem, idx) => {
        const item = normalizeItem ? normalizeItem(rawItem) : rawItem;
        if (filterItem && !filterItem(item, idx)) return;
        visible.push({ item, idx });
      });

      if (!visible.length) {
        listEl.appendChild(el("div", "spell-muted", "No entries match this filter."));
        return;
      }

      visible.forEach(({ item, idx }) => {
        if (!renderCard) {
          // Should not happen in current UI, but keep safe.
          listEl.appendChild(el("div", "spell-muted", JSON.stringify(item)));
          return;
        }

        const onEdit = () => {
          setEditing(idx, item);
          setStatus("Editing entry.");
          onEditItem?.(idx, item);
        };

        const onDelete = () => {
          const ok = window.confirm("Remove this entry?");
          if (!ok) return;
          const next = read();
          next.splice(idx, 1);
          write(next);
          stopEditing();
          refreshPreview();
          render();
          setStatus("Removed.");
        };

        listEl.appendChild(renderCard(item, { onEdit, onDelete }));
      });
    };

    addBtn?.addEventListener("click", () => {
      const item = {};
      for (const key of Object.keys(builder)) {
        item[key] = (builder[key]?.value ?? "").trim();
      }
      const normalized = normalizeItem ? normalizeItem(item) : item;

      if (!normalized?.name) {
        setStatus("Name is required.", "error");
        builder.name?.focus();
        return;
      }

      const items = read();
      if (editingIndex === null) items.push(normalized);
      else items[editingIndex] = normalized;

      write(items);
      stopEditing();
      clearBuilder();
      refreshPreview();
      render();
      setStatus(editingIndex === null ? "Added." : "Updated.");
    });

    return {
      render,
      sync: () => {
        stopEditing();
        render();
      },
    };
  }

  function saveToStorage() {
    const data = readSheet();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      data
    }));
    setStatus("Saved.");
  }

  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setStatus("Nothing saved yet.");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      writeSheet(parsed?.data ?? {});
      refreshPreview();
      syncSpellsUI();
      syncActionsUI();
      syncInventoryUI();
      syncFeaturesUI();
      syncPortraitUI();
      syncHeartsUI();
      setStatus("Loaded.");
    } catch {
      setStatus("Save data corrupted.", "error");
    }
  }

  function resetSheet() {
    const ok = window.confirm("Reset all fields? (This does not clear your saved copy unless you save again.)");
    if (!ok) return;
    writeSheet({});
    refreshPreview();
    syncSpellsUI();
    syncActionsUI();
    syncInventoryUI();
    syncFeaturesUI();
    syncPortraitUI();
    syncHeartsUI();
    setStatus("Reset.");
  }

  function exportJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sheet: readSheet(),
    };

    const text = JSON.stringify(payload, null, 2);
    if (exportPreviewEl) exportPreviewEl.value = text;

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (payload.sheet.name ? `${payload.sheet.name}` : "character") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Exported JSON.");
  }

  async function importJsonFile(file) {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setStatus("Invalid JSON.", "error");
      return;
    }

    const incoming = parsed?.sheet ?? parsed?.data ?? parsed;
    if (!incoming || typeof incoming !== "object") {
      setStatus("JSON format not recognized.", "error");
      return;
    }

    writeSheet(incoming);
    refreshPreview();
    syncSpellsUI();
    syncActionsUI();
    syncInventoryUI();
    syncFeaturesUI();
    syncPortraitUI();
    syncHeartsUI();
    setStatus("Imported.");
  }

  function wireUp() {
    const btnSave = document.getElementById("btnSave");
    const btnLoad = document.getElementById("btnLoad");
    const btnReset = document.getElementById("btnReset");
    const btnExport = document.getElementById("btnExport");
    const fileImport = document.getElementById("fileImport");

    btnSave?.addEventListener("click", saveToStorage);
    btnLoad?.addEventListener("click", loadFromStorage);
    btnReset?.addEventListener("click", resetSheet);
    btnExport?.addEventListener("click", exportJson);

    // Tabs
    const tabButtons = Array.from(document.querySelectorAll(".tab-btn[data-tab]"));
    const tabPanels = Array.from(document.querySelectorAll(".tab-panel[data-panel]"));

    const setActiveTab = (tabName) => {
      for (const btn of tabButtons) {
        const isActive = btn.dataset.tab === tabName;
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      }
      for (const panel of tabPanels) {
        const isActive = panel.dataset.panel === tabName;
        if (isActive) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      }
    };

    for (const btn of tabButtons) {
      btn.addEventListener("click", () => {
        setActiveTab(btn.dataset.tab);
      });
    }

    // Initialize based on the currently-selected tab.
    const initialTab = tabButtons.find((b) => b.getAttribute("aria-selected") === "true")?.dataset.tab
      ?? tabButtons[0]?.dataset.tab;
    if (initialTab) setActiveTab(initialTab);

    // Portrait upload
    const profileUpload = /** @type {HTMLInputElement | null} */ (document.getElementById("profileUpload"));
    const profileImg = /** @type {HTMLImageElement | null} */ (document.getElementById("profileImg"));
    const profileImageData = /** @type {HTMLInputElement | null} */ (document.getElementById("profileImageData"));

    const applyPortrait = () => {
      const dataUrl = (profileImageData?.value ?? "").trim();
      if (profileImg) {
        profileImg.src = dataUrl || "";
        profileImg.alt = dataUrl ? "Character portrait" : "No portrait";
      }
    };

    syncPortraitUI = applyPortrait;

    profileUpload?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setStatus("Please choose an image.", "error");
        return;
      }

      // Read as data URL. (Kept simple; can be large if you choose a huge image.)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      }).catch(() => "");

      if (!dataUrl) {
        setStatus("Failed to load image.", "error");
        return;
      }

      if (profileImageData) profileImageData.value = dataUrl;
      applyPortrait();
      refreshPreview();
      setStatus("Portrait updated.");
    });

    fileImport?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await importJsonFile(file);
    });

    // Autoshow a preview that stays current, but don't spam storage.
    refreshPreview = () => {
      if (!exportPreviewEl) return;
      const payload = {
        version: 1,
        sheet: readSheet(),
      };
      exportPreviewEl.value = JSON.stringify(payload, null, 2);
    };

    // Spells builder
    const makeKv = (k, v) => {
      const wrap = el("div", "item-kv");
      wrap.appendChild(el("div", "item-k", k));
      wrap.appendChild(el("div", "item-v", v || "—"));
      return wrap;
    };

    const makeCard = ({ name, badge, meta, wide }, { onEdit, onDelete }) => {
      const card = el("div", "item-card");
      const head = el("div", "item-head");

      const title = el("div", "item-title");
      title.appendChild(el("div", "item-name", name || "(Unnamed)"));
      if (badge) title.appendChild(el("div", "item-badge", badge));

      const actions = el("div", "item-actions");
      const btnEdit = el("button", "mini-btn", "Edit");
      btnEdit.type = "button";
      btnEdit.addEventListener("click", onEdit);
      const btnDel = el("button", "mini-btn danger", "Del");
      btnDel.type = "button";
      btnDel.addEventListener("click", onDelete);
      actions.append(btnEdit, btnDel);

      head.append(title, actions);

      const body = el("div", "item-body");
      if (meta?.length) {
        const metaGrid = el("div", "item-meta");
        for (const [k, v] of meta) metaGrid.appendChild(makeKv(k, v));
        body.appendChild(metaGrid);
      }
      if (wide?.length) {
        const wideWrap = el("div", "item-wide");
        for (const [k, v] of wide) wideWrap.appendChild(makeKv(k, v));
        body.appendChild(wideWrap);
      }

      card.append(head, body);
      return card;
    };

    const spellsManager = createJsonListManager({
      dataEl: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("spellsData")),
      listEl: document.getElementById("spellsList"),
      addBtn: document.getElementById("btnAddSpell"),
      addLabel: "+ Add",
      saveLabel: "Save",
      emptyMessage: "No spells added yet. Use the builder above, then + Add.",
      builder: {
        name: /** @type {HTMLInputElement | null} */ (document.getElementById("spellName")),
        level: /** @type {HTMLInputElement | null} */ (document.getElementById("spellLevel")),
        time: /** @type {HTMLInputElement | null} */ (document.getElementById("spellTime")),
        range: /** @type {HTMLInputElement | null} */ (document.getElementById("spellRange")),
        components: /** @type {HTMLInputElement | null} */ (document.getElementById("spellComponents")),
        duration: /** @type {HTMLInputElement | null} */ (document.getElementById("spellDuration")),
        effect: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("spellEffect")),
        notes: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("spellNotes")),
      },
      normalizeItem: (s) => ({
        name: (s?.name ?? "").trim(),
        level: (s?.level ?? "").trim(),
        time: (s?.time ?? "").trim(),
        range: (s?.range ?? "").trim(),
        components: (s?.components ?? "").trim(),
        duration: (s?.duration ?? "").trim(),
        effect: (s?.effect ?? "").trim(),
        notes: (s?.notes ?? "").trim(),
      }),
      legacyParse: (raw) => {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.map((line) => {
          const parts = line.split(/\s+—\s+/);
          const [name, time, range, effect] = parts;
          return {
            name: name ?? "",
            level: "",
            time: time ?? "",
            range: range ?? "",
            components: "",
            duration: "",
            effect: effect ?? (parts.length > 1 ? "" : line),
            notes: "",
          };
        });
      },
      renderCard: (s, handlers) => makeCard({
        name: s?.name,
        badge: s?.level,
        meta: [
          ["Casting Time", s?.time],
          ["Range / Area", s?.range],
          ["Components", s?.components],
          ["Duration", s?.duration],
        ],
        wide: [
          ["Effect", s?.effect],
          ["Notes / Tags", s?.notes],
        ],
      }, handlers),
    });

    syncSpellsUI = () => spellsManager.sync();

    // Actions manager
    let actionsFilter = "all";
    const actionsManager = createJsonListManager({
      dataEl: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("actionsData")),
      listEl: document.getElementById("actionsList"),
      addBtn: document.getElementById("btnAddAction"),
      addLabel: "+ Add",
      saveLabel: "Save",
      emptyMessage: "No actions yet. Use the builder above, then + Add.",
      builder: {
        name: /** @type {HTMLInputElement | null} */ (document.getElementById("actionName")),
        kind: /** @type {HTMLSelectElement | null} */ (document.getElementById("actionKind")),
        type: /** @type {HTMLInputElement | null} */ (document.getElementById("actionType")),
        toHit: /** @type {HTMLInputElement | null} */ (document.getElementById("actionToHit")),
        effect: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("actionEffect")),
        notes: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("actionNotes")),
      },
      normalizeItem: (a) => ({
        name: (a?.name ?? "").trim(),
        kind: (a?.kind ?? "Action").toString().trim() || "Action",
        type: (a?.type ?? "").trim(),
        toHit: (a?.toHit ?? "").trim(),
        effect: (a?.effect ?? "").trim(),
        notes: (a?.notes ?? "").trim(),
      }),
      legacyParse: (raw) => {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.map((name) => ({ name, kind: "Action", type: "", toHit: "", effect: "", notes: "" }));
      },
      filterItem: (a) => {
        if (actionsFilter === "all") return true;
        const kind = (a?.kind ?? "").toString().toLowerCase();
        if (actionsFilter === "attack") return kind === "attack";
        if (actionsFilter === "action") return kind === "action";
        if (actionsFilter === "bonus") return kind === "bonus action";
        if (actionsFilter === "reaction") return kind === "reaction";
        if (actionsFilter === "other") return kind === "other";
        return true;
      },
      renderCard: (a, handlers) => makeCard({
        name: a?.name,
        badge: a?.kind,
        meta: [
          ["Subtype", a?.type],
          ["To Hit / DC", a?.toHit],
        ],
        wide: [
          ["Damage / Effect", a?.effect],
          ["Notes", a?.notes],
        ],
      }, handlers),
    });

    syncActionsUI = () => actionsManager.sync();

    // Actions filter tabs
    const actionFilterButtons = Array.from(document.querySelectorAll('.subtab-btn[data-action-filter]'));
    const setActionsFilter = (next) => {
      actionsFilter = next;
      for (const b of actionFilterButtons) {
        const isActive = b.dataset.actionFilter === next;
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      }
      actionsManager.render();
    };
    for (const b of actionFilterButtons) {
      b.addEventListener("click", () => setActionsFilter(b.dataset.actionFilter || "all"));
    }

    // Inventory manager
    const inventoryManager = createJsonListManager({
      dataEl: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("inventoryData")),
      listEl: document.getElementById("inventoryList"),
      addBtn: document.getElementById("btnAddItem"),
      addLabel: "+ Add",
      saveLabel: "Save",
      emptyMessage: "No items yet. Use the builder above, then + Add.",
      builder: {
        name: /** @type {HTMLInputElement | null} */ (document.getElementById("itemName")),
        qty: /** @type {HTMLInputElement | null} */ (document.getElementById("itemQty")),
        category: /** @type {HTMLInputElement | null} */ (document.getElementById("itemCategory")),
        notes: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemNotes")),
        tags: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemTags")),
      },
      normalizeItem: (i) => ({
        name: (i?.name ?? "").trim(),
        qty: (i?.qty ?? "").trim(),
        category: (i?.category ?? "").trim(),
        notes: (i?.notes ?? "").trim(),
        tags: (i?.tags ?? "").trim(),
      }),
      legacyParse: (raw) => {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.map((name) => ({ name, qty: "", category: "", notes: "", tags: "" }));
      },
      renderCard: (i, handlers) => makeCard({
        name: i?.name,
        badge: i?.category,
        meta: [
          ["Quantity", i?.qty],
        ],
        wide: [
          ["Notes", i?.notes],
          ["Tags", i?.tags],
        ],
      }, handlers),
    });

    syncInventoryUI = () => inventoryManager.sync();

    // Features manager
    const featuresManager = createJsonListManager({
      dataEl: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("featuresData")),
      listEl: document.getElementById("featuresList"),
      addBtn: document.getElementById("btnAddFeature"),
      addLabel: "+ Add",
      saveLabel: "Save",
      emptyMessage: "No features yet. Use the builder above, then + Add.",
      builder: {
        name: /** @type {HTMLInputElement | null} */ (document.getElementById("featureName")),
        source: /** @type {HTMLInputElement | null} */ (document.getElementById("featureSource")),
        uses: /** @type {HTMLInputElement | null} */ (document.getElementById("featureUses")),
        desc: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("featureDesc")),
        notes: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("featureNotes")),
      },
      normalizeItem: (f) => ({
        name: (f?.name ?? "").trim(),
        source: (f?.source ?? "").trim(),
        uses: (f?.uses ?? "").trim(),
        desc: (f?.desc ?? "").trim(),
        notes: (f?.notes ?? "").trim(),
      }),
      legacyParse: (raw) => {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.map((name) => ({ name, source: "", uses: "", desc: "", notes: "" }));
      },
      renderCard: (f, handlers) => makeCard({
        name: f?.name,
        badge: f?.source,
        meta: [
          ["Uses", f?.uses],
        ],
        wide: [
          ["Description", f?.desc],
          ["Notes", f?.notes],
        ],
      }, handlers),
      onEditItem: () => {
        panelViews.features = "form";
        applyPanelView("features");
      },
    });

    syncFeaturesUI = () => featuresManager.sync();

    // Hearts visual
    const heartsVisualEl = document.getElementById("heartsVisual");
    const heartsVisualHeaderEl = document.getElementById("heartsVisualHeader");
    const hpEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="hp"]'));
    const hpMaxEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="hp_max"]'));
    const hpTempEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="hp_temp"]'));

    const renderHearts = () => {
      const targets = [heartsVisualEl, heartsVisualHeaderEl].filter(Boolean);
      if (!targets.length) return;
      const hp = toInt(hpEl?.value);
      const max = Math.max(0, toInt(hpMaxEl?.value));
      const temp = Math.max(0, toInt(hpTempEl?.value));
      const safeMax = Math.min(max, 60); // avoid DOM spam

      for (const target of /** @type {HTMLElement[]} */ (targets)) {
        target.innerHTML = "";

        if (!safeMax && !temp) {
          target.appendChild(el("span", "spell-muted", "Set Max hearts to show containers."));
          continue;
        }

        for (let i = 0; i < safeMax; i++) {
          const filled = i < Math.max(0, Math.min(hp, safeMax));
          const heart = el("span", "heart " + (filled ? "full" : "empty"), filled ? "♥" : "♡");
          target.appendChild(heart);
        }
        // temp hearts shown after max
        for (let i = 0; i < Math.min(temp, 20); i++) {
          const heart = el("span", "heart temp", "♥");
          target.appendChild(heart);
        }

        if (max > safeMax) {
          target.appendChild(el("span", "spell-muted", `+${max - safeMax} more`));
        }
      }
    };

    syncHeartsUI = renderHearts;

    // Stamina preview (header)
    const staminaWheelHeaderEl = document.getElementById("staminaWheelHeader");
    const staminaTextHeaderEl = document.getElementById("staminaTextHeader");
    const staminaCurrentHeaderEl = document.getElementById("staminaCurrentHeader");
    const staminaMaxHeaderEl = document.getElementById("staminaMaxHeader");

    const staminaValueEl = document.getElementById("staminaValue");
    const staminaTempValueEl = document.getElementById("staminaTempValue");

    const staminaEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="stamina"]'));
    const staminaMaxEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="stamina_max"]'));
    const staminaTempEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="stamina_temp"]'));

    const renderStamina = () => {
      if (!staminaWheelHeaderEl && !staminaTextHeaderEl && !staminaCurrentHeaderEl && !staminaMaxHeaderEl) return;

      const max = Math.max(0, toInt(staminaMaxEl?.value));

      // Each ring represents 50% of max stamina.
      const ringCap = Math.max(0, Math.floor(max * 0.5));
      const maxTempAllowed = ringCap;

      let cur = Math.max(0, toInt(staminaEl?.value));
      cur = Math.min(cur, max);

      // Temp stamina only allowed if stamina is already at max.
      const tempAllowed = max > 0 && cur >= max;
      let temp = Math.max(0, toInt(staminaTempEl?.value));
      if (!tempAllowed) temp = 0;
      temp = Math.min(temp, maxTempAllowed);

      if (staminaEl) {
        staminaEl.max = String(max);
        staminaEl.value = String(cur);
      }
      if (staminaTempEl) {
        staminaTempEl.max = String(maxTempAllowed);
        staminaTempEl.value = String(temp);
        staminaTempEl.disabled = !tempAllowed;
      }

      if (staminaValueEl) staminaValueEl.textContent = String(cur);
      if (staminaTempValueEl) staminaTempValueEl.textContent = String(temp);

      const p1 = ringCap > 0 ? Math.max(0, Math.min(1, cur / ringCap)) : 0;
      const p2 = ringCap > 0 ? Math.max(0, Math.min(1, (cur - ringCap) / ringCap)) : 0;
      const t = ringCap > 0 ? Math.max(0, Math.min(1, temp / ringCap)) : 0;

      if (staminaWheelHeaderEl) {
        staminaWheelHeaderEl.style.setProperty("--p1", `${p1 * 100}%`);
        staminaWheelHeaderEl.style.setProperty("--p2", `${p2 * 100}%`);
        staminaWheelHeaderEl.style.setProperty("--t", `${t * 100}%`);
      }
      if (staminaTextHeaderEl) staminaTextHeaderEl.textContent = temp > 0 ? `${cur}/${max} +${temp}` : `${cur}/${max}`;
      if (staminaCurrentHeaderEl) staminaCurrentHeaderEl.textContent = String(cur);
      if (staminaMaxHeaderEl) staminaMaxHeaderEl.textContent = String(max);
    };

    syncStaminaUI = renderStamina;

    // Header abilities preview (base + add)
    const abilityPreview = [
      {
        baseName: 'score_courage',
        addName: 'attr_courage',
        baseEl: document.getElementById('abilityBaseCourage'),
        addEl: document.getElementById('abilityBonusCourage'),
      },
      {
        baseName: 'score_agility',
        addName: 'attr_agility',
        baseEl: document.getElementById('abilityBaseAgility'),
        addEl: document.getElementById('abilityBonusAgility'),
      },
      {
        baseName: 'score_wisdom',
        addName: 'attr_wisdom',
        baseEl: document.getElementById('abilityBaseWisdom'),
        addEl: document.getElementById('abilityBonusWisdom'),
      },
      {
        baseName: 'score_wit',
        addName: 'attr_wit',
        baseEl: document.getElementById('abilityBaseWit'),
        addEl: document.getElementById('abilityBonusWit'),
      },
      {
        baseName: 'score_power',
        addName: 'attr_power',
        baseEl: document.getElementById('abilityBasePower'),
        addEl: document.getElementById('abilityBonusPower'),
      },
      {
        baseName: 'score_spirit',
        addName: 'attr_spirit',
        baseEl: document.getElementById('abilityBaseSpirit'),
        addEl: document.getElementById('abilityBonusSpirit'),
      },
    ];

    const renderHeaderAbilities = () => {
      for (const a of abilityPreview) {
        const baseInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${a.baseName}"]`));
        const addInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${a.addName}"]`));
        const baseRaw = (baseInput?.value ?? "").trim();
        const addRaw = (addInput?.value ?? "").trim();
        const base = baseRaw === "" ? "0" : baseRaw;
        let add = addRaw === "" ? "+0" : addRaw;
        if (/^-?\d+$/.test(add)) {
          const n = Number(add);
          add = `${n >= 0 ? "+" : ""}${n}`;
        }
        if (a.baseEl) a.baseEl.textContent = base;
        if (a.addEl) a.addEl.textContent = add;
      }
    };

    syncHeaderAbilitiesUI = renderHeaderAbilities;

    for (const el of getAllFields()) {
      el.addEventListener("input", () => {
        refreshPreview();
        const name = el.getAttribute("name");
        if (name === "spells") syncSpellsUI();
        if (name === "actions") syncActionsUI();
        if (name === "inventory") syncInventoryUI();
        if (name === "features") syncFeaturesUI();
        if (name === "profile_image") syncPortraitUI();
        if (name === "hp" || name === "hp_max" || name === "hp_temp") syncHeartsUI();
        if (name === "stamina" || name === "stamina_max" || name === "stamina_temp") syncStaminaUI();
        if (name && (name.startsWith("score_") || name.startsWith("attr_"))) syncHeaderAbilitiesUI();
      });
    }

    refreshPreview();
    syncPortraitUI();
    syncSpellsUI();
    syncActionsUI();
    syncInventoryUI();
    syncFeaturesUI();
    syncHeartsUI();
    syncStaminaUI();
    syncHeaderAbilitiesUI();
  }

  wireUp();
})();
