(() => {
  const STORAGE_KEY = "lozrp.sheet.v1";
  const PORTRAIT_KEY = "lozrp.sheet.portrait.v1";

  let lastStorageErrorAt = 0;

  /** @type {() => void} */
  let refreshPreview = () => {};

  /** @type {() => void} */
  let syncSpellsUI = () => {};

  /** @type {() => void} */
  let syncActionsUI = () => {};

  /** @type {() => void} */
  let syncInventoryUI = () => {};

  /** @type {() => void} */
  let syncEquipmentUI = () => {};

  /** @type {() => void} */
  let syncFeaturesUI = () => {};

  /** @type {() => void} */
  let syncPortraitUI = () => {};

  /** @type {() => void} */
  let syncHeartsUI = () => {};

  /** @type {() => void} */
  let syncStaminaUI = () => {};

  /** @type {() => void} */
  let syncManaUI = () => {};

  /** @type {() => void} */
  let syncHeaderAbilitiesUI = () => {};

  /** @type {() => void} */
  let syncSkillsUI = () => {};

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

  function readSheet({ includePortrait = true } = {}) {
    const data = {};
    for (const el of getAllFields()) {
      const name = el.getAttribute("name");
      if (!name) continue;
      if (name === "exportPreview") continue;
      if (!includePortrait && name === "profile_image") continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        data[name] = el.checked;
      } else {
        data[name] = el.value;
      }
    }
    return data;
  }

  function writeSheet(data) {
    const toBool = (v) => {
      if (v === true) return true;
      if (v === false) return false;
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) return false;
      return s === "1" || s === "true" || s === "yes" || s === "on";
    };

    // Special-case stamina range inputs: browsers clamp `type=range` values to the
    // current max, and our max starts at 0 until stamina sync runs.
    const pendingStamina = {
      stamina: data?.stamina ?? undefined,
      stamina_temp: data?.stamina_temp ?? undefined,
    };

    // Same behavior for mana.
    const pendingMana = {
      mana: data?.mana ?? undefined,
      mana_temp: data?.mana_temp ?? undefined,
    };

    for (const el of getAllFields()) {
      const name = el.getAttribute("name");
      if (!name) continue;
      if (name === "exportPreview") continue;
      if (name === "stamina" || name === "stamina_temp") continue;
      if (name === "mana" || name === "mana_temp") continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = toBool(data?.[name]);
      } else {
        el.value = data?.[name] ?? "";
      }
    }

    // First sync updates range max values based on stamina_max.
    syncStaminaUI();

    // First sync updates range max values based on mana_max.
    syncManaUI();

    // Now set saved range values when max is correct (prevents clamping to 0).
    const staminaEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="stamina"]'));
    const staminaTempEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="stamina_temp"]'));
    if (staminaEl && pendingStamina.stamina !== undefined) staminaEl.value = String(pendingStamina.stamina ?? "");
    if (staminaTempEl && pendingStamina.stamina_temp !== undefined) staminaTempEl.value = String(pendingStamina.stamina_temp ?? "");

    const manaEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="mana"]'));
    const manaTempEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="mana_temp"]'));
    if (manaEl && pendingMana.mana !== undefined) manaEl.value = String(pendingMana.mana ?? "");
    if (manaTempEl && pendingMana.mana_temp !== undefined) manaTempEl.value = String(pendingMana.mana_temp ?? "");

    // Second sync clamps + updates visuals.
    syncStaminaUI();
    syncManaUI();
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
    onChange,
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
      onChange?.();
    };

    const clearBuilder = () => {
      for (const key of Object.keys(builder)) {
        const input = builder[key];
        if (!input) continue;
        if (input instanceof HTMLInputElement && input.type === "checkbox") {
          input.checked = false;
        } else {
          input.value = "";
        }
      }
    };

    const setEditing = (idx, item) => {
      editingIndex = idx;
      for (const key of Object.keys(builder)) {
        const input = builder[key];
        if (!input) continue;
        if (input instanceof HTMLInputElement && input.type === "checkbox") {
          input.checked = Boolean(item?.[key]);
        } else {
          input.value = item?.[key] ?? "";
        }
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

        listEl.appendChild(renderCard(item, { onEdit, onDelete }, idx));
      });
    };

    addBtn?.addEventListener("click", () => {
      const item = {};
      for (const key of Object.keys(builder)) {
        const input = builder[key];
        if (!input) {
          item[key] = "";
          continue;
        }
        if (input instanceof HTMLInputElement && input.type === "checkbox") {
          item[key] = input.checked;
        } else {
          item[key] = (input.value ?? "").trim();
        }
      }
      const normalized = normalizeItem ? normalizeItem(item) : item;

      if (!normalized?.name) {
        setStatus("Name is required.", "error");
        builder.name?.focus();
        return;
      }

      const items = read();
      if (editingIndex === null) items.push(normalized);
      else {
        // Preserve any keys not present in the builder (backwards/forwards compatibility).
        const prev = items[editingIndex];
        if (prev && typeof prev === "object") items[editingIndex] = { ...prev, ...normalized };
        else items[editingIndex] = normalized;
      }

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

  function saveToStorage({ silent = false } = {}) {
    // Keep portrait separate so a large image can't block saving core sheet values.
    const data = readSheet({ includePortrait: false });
    const portrait = (/** @type {HTMLInputElement | null} */ (document.getElementById("profileImageData"))?.value ?? "").trim();

    let ok = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        data,
      }));
      ok = true;
      if (!silent) setStatus("Saved.");
    } catch {
      const now = Date.now();
      if (now - lastStorageErrorAt > 2500) {
        lastStorageErrorAt = now;
        setStatus("Autosave failed (storage full).", "error");
      }
    }

    // Portrait is optional; failing to store it shouldn't block core saves.
    try {
      if (portrait) localStorage.setItem(PORTRAIT_KEY, portrait);
      else localStorage.removeItem(PORTRAIT_KEY);
    } catch {
      const now = Date.now();
      if (now - lastStorageErrorAt > 2500) {
        lastStorageErrorAt = now;
        setStatus("Portrait couldn't be saved (storage full). Use a smaller image.", "error");
      }
    }

    return ok;
  }

  function loadFromStorage({ silent = false } = {}) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (!silent) setStatus("Nothing saved yet.");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      writeSheet(parsed?.data ?? {});

      // Restore portrait saved separately (if present).
      const storedPortrait = (localStorage.getItem(PORTRAIT_KEY) ?? "").trim();
      const profileImageData = /** @type {HTMLInputElement | null} */ (document.getElementById("profileImageData"));
      if (profileImageData && storedPortrait) profileImageData.value = storedPortrait;

      refreshPreview();
      syncSpellsUI();
      syncActionsUI();
      syncInventoryUI();
      syncEquipmentUI();
      syncFeaturesUI();
      syncPortraitUI();
      syncHeartsUI();
      syncStaminaUI();
      syncManaUI();
      syncSkillsUI();
      if (!silent) setStatus("Loaded.");
    } catch {
      if (!silent) setStatus("Save data corrupted.", "error");
    }
  }

  function resetSheet() {
    const ok = window.confirm("Reset all fields? (This will also update autosave.)");
    if (!ok) return;
    writeSheet({});
    try { localStorage.removeItem(PORTRAIT_KEY); } catch { /* ignore */ }
    refreshPreview();
    syncSpellsUI();
    syncActionsUI();
    syncInventoryUI();
    syncEquipmentUI();
    syncFeaturesUI();
    syncPortraitUI();
    syncHeartsUI();
    syncStaminaUI();
    syncManaUI();
    syncSkillsUI();
    saveToStorage({ silent: true });
    setStatus("Reset.");
  }

  function exportJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sheet: readSheet(),
    };

    const text = JSON.stringify(payload, null, 2);

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (payload.sheet.name ? `${payload.sheet.name}` : "character") + ".loz";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Exported JSON.");
  }

  async function importJsonFile(file) {
    const fileName = (file?.name ?? "").toLowerCase();
    if (!fileName.endsWith(".loz")) {
      setStatus("Please choose a .loz file.", "error");
      return;
    }

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
    syncEquipmentUI();
    syncFeaturesUI();
    syncPortraitUI();
    syncHeartsUI();
    syncStaminaUI();
    syncManaUI();
    syncSkillsUI();
    saveToStorage({ silent: true });
    setStatus("Imported.");
  }

  function wireUp() {
    const btnSave = document.getElementById("btnSave");
    const btnLoad = document.getElementById("btnLoad");
    const btnReset = document.getElementById("btnReset");
    const btnExport = document.getElementById("btnExport");
    const fileImport = document.getElementById("fileImport");
    const fileQuickLoad = document.getElementById("fileQuickLoad");

    // Save/Load buttons act as file export/import (no raw JSON preview).
    btnSave?.addEventListener("click", exportJson);
    btnLoad?.addEventListener("click", () => {
      /** @type {HTMLInputElement | null} */ (fileQuickLoad)?.click();
    });
    btnReset?.addEventListener("click", resetSheet);
    btnExport?.addEventListener("click", exportJson);

    // Autosave: debounce changes so edits persist immediately without spamming localStorage.
    let autosaveTimer = 0;
    const scheduleAutosave = () => {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(() => saveToStorage({ silent: true }), 250);
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });

    const compressDataUrl = async (dataUrl, { maxDim = 420, quality = 0.78 } = {}) => {
      // Downscale to keep localStorage usage reasonable.
      // Uses JPEG for good compression; fallback to original on failure.
      const img = new Image();
      img.decoding = "async";
      img.src = dataUrl;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return dataUrl;

      const scale = Math.min(1, maxDim / Math.max(w, h));
      const outW = Math.max(1, Math.round(w * scale));
      const outH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, outW, outH);

      try {
        const jpeg = canvas.toDataURL("image/jpeg", quality);
        return jpeg || dataUrl;
      } catch {
        return dataUrl;
      }
    };

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

      // Read and compress as data URL to ensure it persists in localStorage.
      const original = await readFileAsDataUrl(file).catch(() => "");
      const dataUrl = original ? await compressDataUrl(original, { maxDim: 420, quality: 0.78 }) : "";

      if (!dataUrl) {
        setStatus("Failed to load image.", "error");
        return;
      }

      if (profileImageData) profileImageData.value = dataUrl;
      applyPortrait();
      refreshPreview();
      // Save immediately so refresh shows the portrait.
      const ok = saveToStorage({ silent: true });
      if (!ok) scheduleAutosave();
      setStatus("Portrait updated.");
    });

    const handleImportChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await importJsonFile(file);
    };

    fileImport?.addEventListener("change", handleImportChange);
    /** @type {HTMLInputElement | null} */ (fileQuickLoad)?.addEventListener("change", handleImportChange);

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

    const makeCard = ({ name, badge, meta, wide }, { onEdit, onDelete }, opts = {}) => {
      const card = el("div", "item-card");
      const head = el("div", "item-head");

      const title = el("div", "item-title");
      title.appendChild(el("div", "item-name", name || "(Unnamed)"));
      if (badge) title.appendChild(el("div", "item-badge", badge));

      const actions = el("div", "item-actions");

      let collapsed = Boolean(opts?.defaultCollapsed);
      const body = el("div", "item-body");
      body.hidden = collapsed;

      if (opts?.collapsible) {
        const btnToggle = el("button", "mini-btn", collapsed ? "Expand" : "Collapse");
        btnToggle.type = "button";
        btnToggle.addEventListener("click", () => {
          collapsed = !collapsed;
          body.hidden = collapsed;
          btnToggle.textContent = collapsed ? "Expand" : "Collapse";
        });
        actions.appendChild(btnToggle);
      }

      if (Array.isArray(opts?.extraActions)) {
        for (const btn of opts.extraActions) {
          if (btn) actions.appendChild(btn);
        }
      }

      const showEdit = opts?.showEdit !== false;
      const showDelete = opts?.showDelete !== false;

      if (showEdit) {
        const btnEdit = el("button", "mini-btn", "Edit");
        btnEdit.type = "button";
        btnEdit.addEventListener("click", onEdit);
        actions.appendChild(btnEdit);
      }

      if (showDelete) {
        const btnDel = el("button", "mini-btn danger", "Del");
        btnDel.type = "button";
        btnDel.addEventListener("click", onDelete);
        actions.appendChild(btnDel);
      }

      head.append(title, actions);

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
      onChange: scheduleAutosave,
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
      onChange: scheduleAutosave,
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
    const normalizeInventoryItem = (i) => {
      const equippable = Boolean(i?.equippable);
      const equipped = Boolean(i?.equipped) && equippable;
      return {
        name: (i?.name ?? "").trim(),
        qty: (i?.qty ?? "").trim(),
        category: (i?.category ?? "").trim(),
        equippable,
        equipped,
        equipType: (i?.equipType ?? "").trim(),
        damage: (i?.damage ?? "").trim(),
        damageType: (i?.damageType ?? "").trim(),
        properties: (i?.properties ?? "").trim(),
        range: (i?.range ?? "").trim(),
        weight: (i?.weight ?? "").trim(),
        armorClass: (i?.armorClass ?? "").trim(),
        notes: (i?.notes ?? "").trim(),
        tags: (i?.tags ?? "").trim(),
      };
    };

    const inventoryDataEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("inventoryData"));

    const readInventoryItems = () => {
      const raw = (inventoryDataEl?.value ?? "").trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(normalizeInventoryItem);
      } catch {
        // fall through
      }
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return lines.map((name) => normalizeInventoryItem({
        name,
        qty: "",
        category: "",
        equippable: false,
        equipped: false,
        equipType: "",
        damage: "",
        damageType: "",
        properties: "",
        range: "",
        weight: "",
        armorClass: "",
        notes: "",
        tags: "",
      }));
    };

    const writeInventoryItems = (items) => {
      if (!inventoryDataEl) return;
      inventoryDataEl.value = JSON.stringify(items.map(normalizeInventoryItem), null, 2);
      scheduleAutosave();
      // Keep both inventory and equipment views in sync.
      syncInventoryUI();
      syncEquipmentUI();
    };

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
        equippable: /** @type {HTMLInputElement | null} */ (document.getElementById("itemEquippable")),
        equipType: /** @type {HTMLSelectElement | null} */ (document.getElementById("itemEquipType")),
        damage: /** @type {HTMLInputElement | null} */ (document.getElementById("itemDamage")),
        damageType: /** @type {HTMLInputElement | null} */ (document.getElementById("itemDamageType")),
        properties: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemProperties")),
        range: /** @type {HTMLInputElement | null} */ (document.getElementById("itemRange")),
        weight: /** @type {HTMLInputElement | null} */ (document.getElementById("itemWeight")),
        armorClass: /** @type {HTMLInputElement | null} */ (document.getElementById("itemArmorClass")),
        notes: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemNotes")),
        tags: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemTags")),
      },
      normalizeItem: normalizeInventoryItem,
      legacyParse: (raw) => {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.map((name) => ({
          name,
          qty: "",
          category: "",
          equippable: false,
          equipped: false,
          equipType: "",
          damage: "",
          damageType: "",
          properties: "",
          range: "",
          weight: "",
          armorClass: "",
          notes: "",
          tags: "",
        }));
      },
      renderCard: (i, handlers, inventoryIndex) => {
        const isEquippable = Boolean(i?.equippable);
        const isEquipped = Boolean(i?.equipped) && isEquippable;
        const type = (i?.equipType ?? "").toString().trim().toLowerCase();

        const isWeapon = type === "weapon_melee" || type === "weapon_ranged";
        const isAmmo = type === "ammo";
        const isArmor = type === "armor_light" || type === "armor_medium" || type === "armor_heavy";
        const isShield = type === "shield";
        const isGear = type === "gear" || type === "tool" || type === "instrument" || type === "wondrous" || type === "ring" || type === "consumable";
        const isFocus = type === "wand" || type === "staff" || type === "rod";

        /** @type {Array<[string, string]>} */
        const meta = [];
        if (i?.qty) meta.push(["Quantity", i?.qty]);
        if (isEquippable) {
          if (type) meta.push(["Type", type.replace(/_/g, " ")]);
          if (i?.weight) meta.push(["Weight", i?.weight]);

          if (isWeapon || isAmmo) {
            if (i?.damage) meta.push(["Damage", i?.damage]);
            if (i?.damageType) meta.push(["Damage Type", i?.damageType]);
          }

          if (type === "weapon_ranged" || isAmmo || isFocus || type === "gear") {
            if (i?.range) meta.push(["Range", i?.range]);
          }

          if (isArmor || isShield) {
            if (i?.armorClass) meta.push(["Armor Class", i?.armorClass]);
          }
        }

        /** @type {Array<[string, string]>} */
        const wide = [];
        if (isEquippable && i?.properties) {
          wide.push(["Properties", i?.properties]);
        }
        if (i?.notes) wide.push(["Notes", i?.notes]);
        if (i?.tags) wide.push(["Tags", i?.tags]);

        const badge = isEquippable
          ? (isEquipped ? "Equipped" : (type ? type.replace(/_/g, " ") : "Equippable"))
          : (i?.category || "");

        const btnEquipToggle = el("button", "mini-btn", isEquipped ? "Unequip" : "Equip");
        btnEquipToggle.type = "button";
        btnEquipToggle.disabled = !isEquippable;
        btnEquipToggle.addEventListener("click", () => {
          const items = readInventoryItems();
          const idx = Number.isFinite(inventoryIndex) ? inventoryIndex : -1;
          if (idx < 0 || !items[idx]) return;
          items[idx].equipped = !isEquipped;
          writeInventoryItems(items);
          setStatus(items[idx].equipped ? "Equipped." : "Unequipped.");
        });

        return makeCard({
          name: i?.name,
          badge: badge || undefined,
          meta,
          wide,
        }, handlers, { collapsible: true, extraActions: [btnEquipToggle] });
      },
      onChange: scheduleAutosave,
      onEditItem: () => {
        window.setTimeout(() => updateInventoryEquipBuilderUI(), 0);
      },
    });

    const equipmentEquippedListEl = document.getElementById("equipmentEquippedList");
    const equipmentAvailableListEl = document.getElementById("equipmentAvailableList");

    const renderEquipmentLists = () => {
      if (!equipmentEquippedListEl || !equipmentAvailableListEl) return;
      const items = readInventoryItems();
      const equippable = items.map((it, idx) => ({ it, idx })).filter(({ it }) => Boolean(it?.equippable));
      const equipped = equippable.filter(({ it }) => Boolean(it?.equipped));
      const available = equippable.filter(({ it }) => !Boolean(it?.equipped));

      const renderGroup = (target, group, emptyText) => {
        target.innerHTML = "";
        if (!group.length) {
          target.appendChild(el("div", "spell-muted", emptyText));
          return;
        }

        for (const { it, idx } of group) {
          const isEquipped = Boolean(it?.equipped);
          const btn = el("button", "mini-btn", isEquipped ? "Unequip" : "Equip");
          btn.type = "button";
          btn.addEventListener("click", () => {
            const next = readInventoryItems();
            if (!next[idx]) return;
            next[idx].equipped = !isEquipped;
            writeInventoryItems(next);
            setStatus(!isEquipped ? "Equipped." : "Unequipped.");
          });

          const rawType = (it?.equipType ?? "").toString().trim().toLowerCase();
          const badge = rawType ? rawType.replace(/_/g, " ") : (isEquipped ? "Equipped" : "Equippable");

          const isWeapon = rawType === "weapon_melee" || rawType === "weapon_ranged";
          const isAmmo = rawType === "ammo";
          const isArmor = rawType === "armor_light" || rawType === "armor_medium" || rawType === "armor_heavy";
          const isShield = rawType === "shield";
          const isFocus = rawType === "wand" || rawType === "staff" || rawType === "rod";
          const isGear = rawType === "gear" || rawType === "tool" || rawType === "instrument" || rawType === "wondrous" || rawType === "ring" || rawType === "consumable";

          /** @type {Array<[string, string]>} */
          const meta = [];
          if (it?.qty) meta.push(["Quantity", it.qty]);
          if (it?.equipType) meta.push(["Type", badge]);
          if (it?.weight) meta.push(["Weight", it.weight]);
          if ((isWeapon || isAmmo) && it?.damage) meta.push(["Damage", it.damage]);
          if ((isWeapon || isAmmo) && it?.damageType) meta.push(["Damage Type", it.damageType]);
          if ((rawType === "weapon_ranged" || isAmmo || isFocus || isGear) && it?.range) meta.push(["Range", it.range]);
          if ((isArmor || isShield) && it?.armorClass) meta.push(["Armor Class", it.armorClass]);

          /** @type {Array<[string, string]>} */
          const wide = [];
          if (it?.properties) wide.push(["Properties", it.properties]);
          if (it?.notes) wide.push(["Notes", it.notes]);
          if (it?.tags) wide.push(["Tags", it.tags]);

          target.appendChild(makeCard({
            name: it?.name,
            badge: isEquipped ? "Equipped" : "Available",
            meta,
            wide,
          }, { onEdit: () => {}, onDelete: () => {} }, { collapsible: true, showEdit: false, showDelete: false, extraActions: [btn] }));
        }
      };

      renderGroup(equipmentEquippedListEl, equipped, "Nothing equipped yet.");
      renderGroup(equipmentAvailableListEl, available, "No equippable items in inventory.");
    };

    syncEquipmentUI = renderEquipmentLists;

    syncInventoryUI = () => {
      inventoryManager.sync();
      syncEquipmentUI();
    };

    // Inventory builder: equippable toggle + conditional field visibility
    const inventoryEquipRoot = document.getElementById("inventoryEquipFields");
    const invEquippableEl = /** @type {HTMLInputElement | null} */ (document.getElementById("itemEquippable"));
    const invTypeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("itemEquipType"));
    const invPropertyPickEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("itemPropertyPick"));
    const invPropertiesEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("itemProperties"));
    const btnAddProperty = document.getElementById("btnAddProperty");
    const btnClearProperties = document.getElementById("btnClearProperties");

    const EQUIP_PROPERTIES = {
      weapon: [
        "Ammunition",
        "Finesse",
        "Heavy",
        "Light",
        "Loading",
        "Reach",
        "Special",
        "Thrown",
        "Two-Handed",
        "Versatile",
      ],
      ammo: [
        "Ammunition",
        "Consumable",
      ],
      armor: [
        "Stealth Disadvantage",
        "Strength Requirement",
      ],
      shield: [
        "Shield",
      ],
      focus: [
        "Arcane Focus",
        "Divine Focus",
        "Druidic Focus",
      ],
      gear: [
        "Consumable",
        "Charges",
        "Attunement",
      ],
    };

    const getEquipKind = (type) => {
      const t = (type ?? "").toString().trim().toLowerCase();
      if (t === "weapon_melee" || t === "weapon_ranged") return "weapon";
      if (t === "ammo") return "ammo";
      if (t === "armor_light" || t === "armor_medium" || t === "armor_heavy") return "armor";
      if (t === "shield") return "shield";
      if (t === "wand" || t === "staff" || t === "rod") return "focus";
      return "gear";
    };

    const normalizePropertiesList = (raw) => {
      const text = (raw ?? "").toString();
      const parts = text
        .split(/[,\n]/g)
        .map((p) => p.trim())
        .filter(Boolean);
      const seen = new Set();
      const out = [];
      for (const p of parts) {
        const key = p.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
      return out;
    };

    const renderPropertyPick = () => {
      if (!invPropertyPickEl) return;
      const type = (invTypeEl?.value ?? "").toString();
      const kind = getEquipKind(type);
      const options = EQUIP_PROPERTIES[kind] ?? [];
      invPropertyPickEl.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = options.length ? "Select…" : "No properties for this type";
      invPropertyPickEl.appendChild(placeholder);
      for (const optText of options) {
        const opt = document.createElement("option");
        opt.value = optText;
        opt.textContent = optText;
        invPropertyPickEl.appendChild(opt);
      }
    };

    const updateInventoryEquipBuilderUI = () => {
      if (!inventoryEquipRoot || !invEquippableEl) return;
      const enabled = Boolean(invEquippableEl.checked);
      inventoryEquipRoot.hidden = !enabled;
      if (!enabled) return;

      const type = (invTypeEl?.value ?? "").toString().trim().toLowerCase();
      const typeFields = Array.from(inventoryEquipRoot.querySelectorAll('[data-equip-for]'));
      for (const node of typeFields) {
        const raw = (node.getAttribute('data-equip-for') ?? '').trim();
        const types = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        node.hidden = !type || !types.includes(type);
      }

      renderPropertyPick();
    };

    invEquippableEl?.addEventListener("change", updateInventoryEquipBuilderUI);
    invTypeEl?.addEventListener("change", updateInventoryEquipBuilderUI);

    btnAddProperty?.addEventListener("click", () => {
      if (!invPropertyPickEl || !invPropertiesEl) return;
      const picked = (invPropertyPickEl.value ?? "").toString().trim();
      if (!picked) return;
      const list = normalizePropertiesList(invPropertiesEl.value);
      list.push(picked);
      invPropertiesEl.value = normalizePropertiesList(list.join(", ")).join(", ");
      invPropertyPickEl.value = "";
    });

    btnClearProperties?.addEventListener("click", () => {
      if (!invPropertiesEl) return;
      invPropertiesEl.value = "";
    });

    document.getElementById("btnAddItem")?.addEventListener("click", () => {
      window.setTimeout(() => updateInventoryEquipBuilderUI(), 0);
    });
    updateInventoryEquipBuilderUI();

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
      onChange: scheduleAutosave,
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
      // Always sync the range inputs when present; header preview is optional.
      if (!staminaEl && !staminaMaxEl && !staminaTempEl) return;

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

    // Mana preview (header)
    const manaWheelHeaderEl = document.getElementById("manaWheelHeader");
    const manaTextHeaderEl = document.getElementById("manaTextHeader");
    const manaCurrentHeaderEl = document.getElementById("manaCurrentHeader");
    const manaMaxHeaderEl = document.getElementById("manaMaxHeader");

    const manaValueEl = document.getElementById("manaValue");
    const manaTempValueEl = document.getElementById("manaTempValue");

    const manaEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="mana"]'));
    const manaMaxEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="mana_max"]'));
    const manaTempEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="mana_temp"]'));

    const renderMana = () => {
      // Always sync the range inputs when present; header preview is optional.
      if (!manaEl && !manaMaxEl && !manaTempEl) return;

      const max = Math.max(0, toInt(manaMaxEl?.value));

      // Each ring represents 50% of max mana.
      const ringCap = Math.max(0, Math.floor(max * 0.5));
      const maxTempAllowed = ringCap;

      let cur = Math.max(0, toInt(manaEl?.value));
      cur = Math.min(cur, max);

      // Temp mana only allowed if mana is already at max.
      const tempAllowed = max > 0 && cur >= max;
      let temp = Math.max(0, toInt(manaTempEl?.value));
      if (!tempAllowed) temp = 0;
      temp = Math.min(temp, maxTempAllowed);

      if (manaEl) {
        manaEl.max = String(max);
        manaEl.value = String(cur);
      }
      if (manaTempEl) {
        manaTempEl.max = String(maxTempAllowed);
        manaTempEl.value = String(temp);
        manaTempEl.disabled = !tempAllowed;
      }

      if (manaValueEl) manaValueEl.textContent = String(cur);
      if (manaTempValueEl) manaTempValueEl.textContent = String(temp);

      const p1 = ringCap > 0 ? Math.max(0, Math.min(1, cur / ringCap)) : 0;
      const p2 = ringCap > 0 ? Math.max(0, Math.min(1, (cur - ringCap) / ringCap)) : 0;
      const t = ringCap > 0 ? Math.max(0, Math.min(1, temp / ringCap)) : 0;

      if (manaWheelHeaderEl) {
        manaWheelHeaderEl.style.setProperty("--p1", `${p1 * 100}%`);
        manaWheelHeaderEl.style.setProperty("--p2", `${p2 * 100}%`);
        manaWheelHeaderEl.style.setProperty("--t", `${t * 100}%`);
      }
      if (manaTextHeaderEl) manaTextHeaderEl.textContent = temp > 0 ? `${cur}/${max} +${temp}` : `${cur}/${max}`;
      if (manaCurrentHeaderEl) manaCurrentHeaderEl.textContent = String(cur);
      if (manaMaxHeaderEl) manaMaxHeaderEl.textContent = String(max);
    };

    syncManaUI = renderMana;

    const toSigned = (n) => `${n >= 0 ? "+" : ""}${n}`;

    // Abilities + Skills: compute ability modifiers and fill skill totals.
    const abilityDefs = [
      { key: 'courage', scoreName: 'score_courage', modName: 'attr_courage', baseEl: document.getElementById('abilityBaseCourage'), modEl: document.getElementById('abilityBonusCourage') },
      { key: 'agility', scoreName: 'score_agility', modName: 'attr_agility', baseEl: document.getElementById('abilityBaseAgility'), modEl: document.getElementById('abilityBonusAgility') },
      { key: 'wisdom', scoreName: 'score_wisdom', modName: 'attr_wisdom', baseEl: document.getElementById('abilityBaseWisdom'), modEl: document.getElementById('abilityBonusWisdom') },
      { key: 'wit', scoreName: 'score_wit', modName: 'attr_wit', baseEl: document.getElementById('abilityBaseWit'), modEl: document.getElementById('abilityBonusWit') },
      { key: 'power', scoreName: 'score_power', modName: 'attr_power', baseEl: document.getElementById('abilityBasePower'), modEl: document.getElementById('abilityBonusPower') },
      { key: 'spirit', scoreName: 'score_spirit', modName: 'attr_spirit', baseEl: document.getElementById('abilityBaseSpirit'), modEl: document.getElementById('abilityBonusSpirit') },
    ];

    const skillDefs = [
      { name: 'skill_acrobatics', profName: 'skill_prof_acrobatics', abilityKey: 'agility' },
      { name: 'skill_animal', profName: 'skill_prof_animal', abilityKey: 'wisdom' },
      { name: 'skill_arcana', profName: 'skill_prof_arcana', abilityKey: 'wit' },
      { name: 'skill_athletics', profName: 'skill_prof_athletics', abilityKey: 'courage' },
      { name: 'skill_deception', profName: 'skill_prof_deception', abilityKey: 'spirit' },
      { name: 'skill_history', profName: 'skill_prof_history', abilityKey: 'wit' },
      { name: 'skill_insight', profName: 'skill_prof_insight', abilityKey: 'wisdom' },
      { name: 'skill_intimidation', profName: 'skill_prof_intimidation', abilityKey: 'spirit' },
      { name: 'skill_investigation', profName: 'skill_prof_investigation', abilityKey: 'wit' },
      { name: 'skill_medicine', profName: 'skill_prof_medicine', abilityKey: 'wisdom' },
      { name: 'skill_nature', profName: 'skill_prof_nature', abilityKey: 'wit' },
      { name: 'skill_perception', profName: 'skill_prof_perception', abilityKey: 'wisdom' },
      { name: 'skill_performance', profName: 'skill_prof_performance', abilityKey: 'spirit' },
      { name: 'skill_persuasion', profName: 'skill_prof_persuasion', abilityKey: 'spirit' },
      { name: 'skill_religion', profName: 'skill_prof_religion', abilityKey: 'wit' },
      { name: 'skill_sleight', profName: 'skill_prof_sleight', abilityKey: 'agility' },
      { name: 'skill_stealth', profName: 'skill_prof_stealth', abilityKey: 'agility' },
      { name: 'skill_survival', profName: 'skill_prof_survival', abilityKey: 'wisdom' },
    ];

    const renderAbilitiesAndSkills = () => {
      /** @type {Record<string, number>} */
      const mods = {};

      for (const a of abilityDefs) {
        const scoreInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${a.scoreName}"]`));
        const modInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${a.modName}"]`));

        const raw = (scoreInput?.value ?? '').trim();
        const score = raw === '' ? 10 : toInt(raw);
        const mod = Math.floor((score - 10) / 2);
        mods[a.key] = mod;

        if (modInput) {
          modInput.readOnly = true;
          modInput.value = toSigned(mod);
        }

        if (a.baseEl) a.baseEl.textContent = String(score);
        if (a.modEl) a.modEl.textContent = toSigned(mod);
      }

      const profEl = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="proficiency"]'));
      const profBonus = toInt((profEl?.value ?? '').trim());

      for (const s of skillDefs) {
        const totalInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${s.name}"]`));
        const profToggle = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${s.profName}"]`));
        if (!totalInput) continue;

        const isProficient = Boolean(profToggle?.checked);
        const total = (mods[s.abilityKey] ?? 0) + (isProficient ? profBonus : 0);
        totalInput.readOnly = true;
        totalInput.value = toSigned(total);
      }
    };

    syncHeaderAbilitiesUI = renderAbilitiesAndSkills;
    syncSkillsUI = renderAbilitiesAndSkills;

    const onAnyFieldChange = (el) => {
      refreshPreview();
      scheduleAutosave();
      const name = el.getAttribute("name");
      if (name === "spells") syncSpellsUI();
      if (name === "actions") syncActionsUI();
      if (name === "inventory") {
        syncInventoryUI();
        syncEquipmentUI();
      }
      if (name === "features") syncFeaturesUI();
      if (name === "profile_image") syncPortraitUI();
      if (name === "hp" || name === "hp_max" || name === "hp_temp") syncHeartsUI();
      if (name === "stamina" || name === "stamina_max" || name === "stamina_temp") syncStaminaUI();
      if (name === "mana" || name === "mana_max" || name === "mana_temp") syncManaUI();
      if (name === "proficiency") syncSkillsUI();
      if (name && (name.startsWith("score_") || name.startsWith("attr_") || name.startsWith("skill_prof_"))) syncSkillsUI();
    };

    for (const el of getAllFields()) {
      el.addEventListener("input", () => onAnyFieldChange(el));
      el.addEventListener("change", () => onAnyFieldChange(el));
    }

    // Auto-load saved sheet (if any) so it appears immediately on visit/refresh.
    loadFromStorage({ silent: true });

    refreshPreview();
    syncPortraitUI();
    syncSpellsUI();
    syncActionsUI();
    syncInventoryUI();
    syncEquipmentUI();
    syncFeaturesUI();
    syncHeartsUI();
    syncStaminaUI();
    syncManaUI();
    syncSkillsUI();
  }

  wireUp();
})();
