"use strict";

/* ==========================================================================
   Спільні витрати — app.js
   Вся логіка додатку: робота з Supabase, рендер списку, модальні вікна.
   ========================================================================== */

const PAYERS = {
  MISHA: "Міша",
  ZHENYA: "Женя",
};

// ---- Supabase client -------------------------------------------------

let supabaseClient = null;
let isConfigured = true;

if (
  typeof SUPABASE_URL === "undefined" ||
  typeof SUPABASE_ANON_KEY === "undefined" ||
  SUPABASE_URL.includes("YOUR-PROJECT-REF") ||
  SUPABASE_ANON_KEY.includes("YOUR-ANON-PUBLIC-KEY")
) {
  isConfigured = false;
} else {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ---- DOM references ----------------------------------------------------

const el = {
  list: document.getElementById("transaction-list"),
  emptyState: document.getElementById("empty-state"),
  statusMessage: document.getElementById("status-message"),

  sumMisha: document.getElementById("sum-misha"),
  sumZhenya: document.getElementById("sum-zhenya"),
  sumTotal: document.getElementById("sum-total"),

  openAddBtn: document.getElementById("open-add-btn"),

  modalOverlay: document.getElementById("modal-overlay"),
  modalTitle: document.getElementById("modal-title"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  form: document.getElementById("transaction-form"),

  transactionIdInput: document.getElementById("transaction-id"),
  payerOptions: document.querySelectorAll(".payer-option"),
  payerError: document.getElementById("payer-error"),
  amountInput: document.getElementById("amount-input"),
  amountError: document.getElementById("amount-error"),
  descriptionInput: document.getElementById("description-input"),
  saveBtn: document.getElementById("save-btn"),

  confirmOverlay: document.getElementById("confirm-overlay"),
  cancelDeleteBtn: document.getElementById("cancel-delete-btn"),
  confirmDeleteBtn: document.getElementById("confirm-delete-btn"),
};

// ---- State ---------------------------------------------------------------

let transactions = [];
let selectedPayer = null;
let pendingDeleteId = null;

// ==========================================================================
// Форматування
// ==========================================================================

function formatAmount(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(2)} zł`;
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function payerSlug(payer) {
  return payer === PAYERS.MISHA ? "misha" : "zhenya";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================================
// Статусні повідомлення
// ==========================================================================

function showStatus(message, type = "error") {
  el.statusMessage.textContent = message;
  el.statusMessage.hidden = false;
  el.statusMessage.classList.toggle("is-loading", type === "loading");
}

function hideStatus() {
  el.statusMessage.hidden = true;
}

// ==========================================================================
// Завантаження та рендер даних
// ==========================================================================

async function loadTransactions() {
  if (!isConfigured) {
    showStatus(
      "Supabase не налаштовано. Відкрийте config.js і вставте URL та anon key вашого проекту."
    );
    el.emptyState.hidden = true;
    return;
  }

  showStatus("Завантаження...", "loading");

  const { data, error } = await supabaseClient
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showStatus("Не вдалося завантажити транзакції. Перевірте налаштування Supabase.");
    return;
  }

  hideStatus();
  transactions = data || [];
  renderAll();
}

function renderAll() {
  renderSummary();
  renderList();
}

function renderSummary() {
  const totals = { [PAYERS.MISHA]: 0, [PAYERS.ZHENYA]: 0 };

  for (const t of transactions) {
    if (totals[t.payer] !== undefined) {
      totals[t.payer] += Number(t.amount) || 0;
    }
  }

  const total = totals[PAYERS.MISHA] + totals[PAYERS.ZHENYA];

  el.sumMisha.textContent = formatAmount(totals[PAYERS.MISHA]);
  el.sumZhenya.textContent = formatAmount(totals[PAYERS.ZHENYA]);
  el.sumTotal.textContent = formatAmount(total);
}

function renderList() {
  el.list.innerHTML = "";

  if (transactions.length === 0) {
    el.emptyState.hidden = false;
    return;
  }

  el.emptyState.hidden = true;

  const fragment = document.createDocumentFragment();

  for (const t of transactions) {
    fragment.appendChild(buildCard(t));
  }

  el.list.appendChild(fragment);
}

function buildCard(t) {
  const li = document.createElement("li");
  li.className = `transaction-card payer-${payerSlug(t.payer)}`;
  li.dataset.id = t.id;

  const description = t.description ? escapeHtml(t.description) : "";

  li.innerHTML = `
    <div class="card-main">
      <div class="card-row card-payer">👤 ${escapeHtml(t.payer)}</div>
      <div class="card-row card-amount">💰 ${formatAmount(t.amount)}</div>
      ${description ? `<div class="card-row card-desc">📝 ${description}</div>` : ""}
      <div class="card-row card-time">${formatTimestamp(t.created_at)}</div>
    </div>
    <div class="card-actions">
      <button type="button" class="icon-btn icon-btn-edit" aria-label="Редагувати">✏️</button>
      <button type="button" class="icon-btn icon-btn-delete" aria-label="Видалити">🗑️</button>
    </div>
  `;

  li.querySelector(".icon-btn-edit").addEventListener("click", () => openEditModal(t));
  li.querySelector(".icon-btn-delete").addEventListener("click", () => openDeleteConfirm(t.id));

  return li;
}

// ==========================================================================
// Модальне вікно: додати / редагувати
// ==========================================================================

function openAddModal() {
  el.modalTitle.textContent = "Нова транзакція";
  el.transactionIdInput.value = "";
  el.amountInput.value = "";
  el.descriptionInput.value = "";
  setSelectedPayer(null);
  clearFieldErrors();
  el.modalOverlay.hidden = false;
  window.setTimeout(() => el.amountInput.focus(), 50);
}

function openEditModal(t) {
  el.modalTitle.textContent = "Редагувати транзакцію";
  el.transactionIdInput.value = t.id;
  el.amountInput.value = Number(t.amount);
  el.descriptionInput.value = t.description || "";
  setSelectedPayer(t.payer);
  clearFieldErrors();
  el.modalOverlay.hidden = false;
}

function closeModal() {
  el.modalOverlay.hidden = true;
}

function setSelectedPayer(payer) {
  selectedPayer = payer;
  el.payerOptions.forEach((btn) => {
    const isSelected = btn.dataset.payer === payer;
    btn.classList.toggle("is-selected", isSelected);
    btn.setAttribute("aria-checked", String(isSelected));
  });
}

function clearFieldErrors() {
  el.payerError.hidden = true;
  el.amountError.hidden = true;
}

function validateForm() {
  let isValid = true;
  clearFieldErrors();

  if (!selectedPayer) {
    el.payerError.hidden = false;
    isValid = false;
  }

  const amount = parseFloat(el.amountInput.value);
  if (!el.amountInput.value || Number.isNaN(amount) || amount <= 0) {
    el.amountError.hidden = false;
    isValid = false;
  }

  return isValid;
}

async function handleFormSubmit(event) {
  event.preventDefault();

  if (!isConfigured) {
    showStatus("Supabase не налаштовано. Дивіться config.js.");
    return;
  }

  if (!validateForm()) return;

  const id = el.transactionIdInput.value;
  const payload = {
    payer: selectedPayer,
    amount: parseFloat(el.amountInput.value),
    description: el.descriptionInput.value.trim() || null,
  };

  el.saveBtn.disabled = true;
  el.saveBtn.textContent = "Збереження...";

  let error;

  if (id) {
    ({ error } = await supabaseClient.from("transactions").update(payload).eq("id", id));
  } else {
    ({ error } = await supabaseClient.from("transactions").insert(payload));
  }

  el.saveBtn.disabled = false;
  el.saveBtn.textContent = "Зберегти";

  if (error) {
    console.error(error);
    showStatus("Не вдалося зберегти транзакцію. Спробуйте ще раз.");
    return;
  }

  closeModal();
  await loadTransactions();
}

// ==========================================================================
// Видалення
// ==========================================================================

function openDeleteConfirm(id) {
  pendingDeleteId = id;
  el.confirmOverlay.hidden = false;
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  el.confirmOverlay.hidden = true;
}

async function handleConfirmDelete() {
  if (!pendingDeleteId) return;

  el.confirmDeleteBtn.disabled = true;
  el.confirmDeleteBtn.textContent = "Видалення...";

  const { error } = await supabaseClient.from("transactions").delete().eq("id", pendingDeleteId);

  el.confirmDeleteBtn.disabled = false;
  el.confirmDeleteBtn.textContent = "Видалити";

  if (error) {
    console.error(error);
    showStatus("Не вдалося видалити транзакцію. Спробуйте ще раз.");
    closeDeleteConfirm();
    return;
  }

  closeDeleteConfirm();
  await loadTransactions();
}

// ==========================================================================
// Обробники подій
// ==========================================================================

el.openAddBtn.addEventListener("click", openAddModal);
el.closeModalBtn.addEventListener("click", closeModal);
el.cancelBtn.addEventListener("click", closeModal);
el.modalOverlay.addEventListener("click", (e) => {
  if (e.target === el.modalOverlay) closeModal();
});

el.payerOptions.forEach((btn) => {
  btn.addEventListener("click", () => setSelectedPayer(btn.dataset.payer));
});

el.form.addEventListener("submit", handleFormSubmit);

el.cancelDeleteBtn.addEventListener("click", closeDeleteConfirm);
el.confirmDeleteBtn.addEventListener("click", handleConfirmDelete);
el.confirmOverlay.addEventListener("click", (e) => {
  if (e.target === el.confirmOverlay) closeDeleteConfirm();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeDeleteConfirm();
  }
});

// ==========================================================================
// Старт
// ==========================================================================

loadTransactions();
