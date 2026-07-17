const form = document.querySelector('#registration-form');
const welcomeDialog = document.querySelector('#welcome-dialog');
const dialog = document.querySelector('#success-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const reason = document.querySelector('#reason');
const charCount = document.querySelector('#char-count');
const classSelect = document.querySelector('#class');
const nameSelect = document.querySelector('#name');
const submitButton = document.querySelector('#submit-button');
const welcomeCloseButton = document.querySelector('#welcome-close');
const welcomeLabel = document.querySelector('#welcome-label');
const confirmText = document.querySelector('#confirm-text');
const confirmContinue = document.querySelector('#confirm-continue');
const confirmCancel = document.querySelector('#confirm-cancel');
const successText = document.querySelector('#success-text');
const joinGroupButton = document.querySelector('#join-group-button');
const countdownDays = document.querySelector('#countdown-days');
const countdownHours = document.querySelector('#countdown-hours');
const countdownMinutes = document.querySelector('#countdown-minutes');
const countdownSeconds = document.querySelector('#countdown-seconds');
const whatsappGroupUrl = 'https://chat.whatsapp.com/CBmuohebctYCtp2GWQxNlx';
const appsScriptUrl =
  document.querySelector('meta[name="tka-apps-script-url"]')?.content?.trim() ||
  window.TKA_APPS_SCRIPT_URL ||
  '';
const scheduleCloseMs = Date.parse('2026-07-24T23:59:59+08:00');

const studentGroups = new Map();
let studentsReady = false;
let pendingSubmission = null;

function openSuccess(message) {
  const title = document.querySelector('#success-title');
  const body = successText;
  if (title) title.textContent = 'Pendaftaran berhasil!';
  if (body) body.textContent = message || 'Pendaftaran sudah diterima.';
  if (joinGroupButton) joinGroupButton.hidden = false;
  dialog.showModal();
}

function openError(message) {
  alert(message || 'Terjadi kesalahan.');
}

function formatCountdown(diffMs) {
  if (diffMs <= 0) return '0 hari 0 jam 0 menit 0 detik';
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days} hari ${hours} jam ${minutes} menit ${seconds} detik`;
}

function splitCountdown(diffMs) {
  const safeDiff = Math.max(0, diffMs);
  const totalSeconds = Math.floor(safeDiff / 1000);
  return {
    days: String(Math.floor(totalSeconds / 86400)).padStart(2, '0'),
    hours: String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, '0'),
    minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
    seconds: String(totalSeconds % 60).padStart(2, '0'),
  };
}

function getRegistrationState(nowMs = Date.now()) {
  if (nowMs > scheduleCloseMs) {
    return {
      open: false,
      phase: 'after',
      label: 'Pendaftaran telah ditutup',
      value: 'Selesai',
    };
  }

  return {
    open: true,
    phase: 'open',
    label: 'Menutup dalam',
    value: formatCountdown(scheduleCloseMs - nowMs),
  };
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map(value => value.trim());
}

function parseStudentRow(line) {
  const cells = parseCsvLine(line);
  if (cells.length >= 2) {
    return [cells[0], cells[1]];
  }

  const cleaned = String(line || '')
    .trim()
    .replace(/^"/, '')
    .replace(/"$/, '')
    .replace(/""/g, '"');

  const lastComma = cleaned.lastIndexOf(',');
  if (lastComma === -1) {
    return ['', ''];
  }

  const name = cleaned.slice(0, lastComma).trim();
  const klass = cleaned.slice(lastComma + 1).trim().replace(/^"|"$/g, '');
  return [name, klass];
}

async function loadStudentData() {
  const response = await fetch('data_siswa_tka_kelas_benar.csv', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Data siswa belum bisa dimuat.');
  }

  const text = await response.text();
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  lines.slice(1).forEach(line => {
    const [nama, kelas] = parseStudentRow(line);
    if (!nama || !kelas) return;
    const key = kelas.toUpperCase();
    if (!studentGroups.has(key)) {
      studentGroups.set(key, []);
    }
    studentGroups.get(key).push(nama);
  });

  studentsReady = true;
}

function updateScheduleUI() {
  const nowMs = Date.now();
  const state = getRegistrationState(nowMs);
  const countdownSource = scheduleCloseMs - nowMs;
  const split = splitCountdown(countdownSource);
  const expired = nowMs > scheduleCloseMs;

  if (welcomeLabel) {
    welcomeLabel.textContent = expired ? 'PENDAFTARAN TELAH DITUTUP' : 'TUTUP DALAM';
  }

  if (countdownDays) countdownDays.textContent = split.days;
  if (countdownHours) countdownHours.textContent = split.hours;
  if (countdownMinutes) countdownMinutes.textContent = split.minutes;
  if (countdownSeconds) countdownSeconds.textContent = split.seconds;

  if (welcomeCloseButton) {
    welcomeCloseButton.disabled = expired;
    welcomeCloseButton.textContent = expired ? 'Pendaftaran Ditutup' : 'Tutup dan Lanjut';
  }

  submitButton.disabled = !state.open || !studentsReady;
  submitButton.title = state.open ? '' : 'Pendaftaran sudah ditutup.';
}

function refreshScheduleLoop() {
  updateScheduleUI();
  window.setTimeout(refreshScheduleLoop, 1000);
}

function setNameOptions() {
  const selectedClass = classSelect.value.trim().toUpperCase();
  const students = studentGroups.get(selectedClass) || [];
  nameSelect.innerHTML = '';

  if (!selectedClass) {
    nameSelect.disabled = true;
    nameSelect.innerHTML = '<option value="">Pilih kelas dulu</option>';
    return;
  }

  if (!students.length) {
    nameSelect.disabled = true;
    nameSelect.innerHTML = '<option value="">Nama untuk kelas ini belum tersedia</option>';
    return;
  }

  nameSelect.disabled = false;
  nameSelect.innerHTML = '<option value="">Pilih nama</option>';
  students.forEach(studentName => {
    const option = document.createElement('option');
    option.value = studentName;
    option.textContent = studentName;
    nameSelect.appendChild(option);
  });
}

function submitToAppsScript(payload) {
  if (!appsScriptUrl) {
    throw new Error('URL Apps Script belum diisi.');
  }

  return fetch(appsScriptUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams(payload).toString(),
  });
}

function buildConfirmationText(payload) {
  return [
    `Nama: ${payload.name}`,
    `Kelas: ${payload.class}`,
    '',
    'Mohon dipahami sebelum melanjutkan:',
    'Pendaftaran hanya bisa dilakukan satu kali.',
    'Jika peserta berhenti di tengah proses pembelajaran, peserta tidak dapat mengikuti kembali.',
    'Maksimal ketidakhadiran adalah 2 kali. Jika melewati batas itu, peserta akan dikeluarkan.',
    'Program ini gratis.',
  ].join('\n');
}

function openConfirmDialog(payload) {
  pendingSubmission = payload;
  confirmText.textContent = buildConfirmationText(payload);
  confirmDialog.showModal();
}

function openWelcomeDialog() {
  if (welcomeDialog && !welcomeDialog.open) {
    welcomeDialog.showModal();
  }
}

async function performSubmission(payload) {
  if (appsScriptUrl) {
    try {
      await submitToAppsScript(payload);
    } catch (error) {
      console.warn('Submit to Apps Script failed:', error);
    }
  }

  form.reset();
  charCount.textContent = '0';
  setNameOptions();
  openSuccess();
}

reason.addEventListener('input', () => {
  charCount.textContent = reason.value.length;
});

classSelect.addEventListener('change', () => {
  setNameOptions();
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  const data = new FormData(form);
  const payload = {
    name: String(data.get('name') || '').trim(),
    class: String(data.get('class') || '').trim(),
    reason: String(data.get('reason') || '').trim(),
  };

  if (!payload.name || !payload.class || !payload.reason) {
    openError('Nama, kelas, dan alasan harus diisi.');
    return;
  }

  const state = getRegistrationState();
  if (!state.open) {
    openError('Pendaftaran sudah ditutup.');
    return;
  }

  openConfirmDialog(payload);
});

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
if (joinGroupButton) {
  joinGroupButton.addEventListener('click', () => {
    window.open(whatsappGroupUrl, '_blank', 'noopener,noreferrer');
  });
}
if (welcomeCloseButton) {
  welcomeCloseButton.addEventListener('click', () => {
    if (Date.now() > scheduleCloseMs) return;
    welcomeDialog.close();
  });
}
if (welcomeDialog) {
  welcomeDialog.addEventListener('cancel', event => {
    if (Date.now() > scheduleCloseMs) {
      event.preventDefault();
    }
  });
}
confirmCancel.addEventListener('click', () => {
  pendingSubmission = null;
  confirmDialog.close();
});
confirmContinue.addEventListener('click', async () => {
  if (!pendingSubmission) return;
  confirmContinue.disabled = true;
  try {
    await performSubmission(pendingSubmission);
    confirmDialog.close();
    pendingSubmission = null;
  } catch (error) {
    openError(error.message);
  } finally {
    confirmContinue.disabled = false;
  }
});

loadStudentData()
  .then(() => {
    setNameOptions();
    refreshScheduleLoop();
    openWelcomeDialog();
  })
  .catch(error => {
    nameSelect.disabled = true;
    nameSelect.innerHTML = '<option value="">Data siswa gagal dimuat</option>';
    console.error(error);
    refreshScheduleLoop();
    openWelcomeDialog();
  });
