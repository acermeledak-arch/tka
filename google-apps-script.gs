const CONFIG = {
  studentSheetName: 'Data Siswa',
  registrationSheetName: 'Pendaftaran TKA',
};
const SCHEDULE_CLOSE = new Date('2026-07-24T23:59:59+08:00');

function doGet() {
  return jsonResponse({
    ok: true,
    message: 'TKA registration endpoint is running.',
  });
}

function doPost(e) {
  try {
    if (!isRegistrationWindowOpen()) {
      return htmlResponse({
        ok: false,
        message: 'Pendaftaran sudah ditutup.',
      });
    }

    const body = parseRequestBody(e);
    const nama = normalizeText(body.name || body.nama);
    const kelas = normalizeText(body.class || body.kelas);
    const alasan = String(body.reason || body.alasan || '').trim();

    if (!nama || !kelas || !alasan) {
      return jsonResponse({ ok: false, message: 'Nama, kelas, dan alasan wajib diisi.' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const ss = getSpreadsheet();
      const studentSheet = ss.getSheetByName(CONFIG.studentSheetName);
      const regSheet = ss.getSheetByName(CONFIG.registrationSheetName);

      if (!studentSheet) {
        return htmlResponse({
          ok: false,
          message: `Sheet "${CONFIG.studentSheetName}" tidak ditemukan.`,
        });
      }

      if (!regSheet) {
        return htmlResponse({
          ok: false,
          message: `Sheet "${CONFIG.registrationSheetName}" tidak ditemukan.`,
        });
      }

      const studentRows = studentSheet.getDataRange().getValues();
      const isStudent = studentRows.slice(1).some(row => {
        const studentName = normalizeText(row[0]);
        const studentClass = normalizeText(row[1]);
        return studentName === nama && studentClass === kelas;
      });

      if (!isStudent) {
        return htmlResponse({
          ok: false,
          message: 'Nama dan kelas tidak ditemukan di daftar siswa.',
        });
      }

      const regRows = regSheet.getDataRange().getValues();
      const alreadyRegistered = regRows.slice(1).some(row => {
        const registeredName = normalizeText(row[1]);
        const registeredClass = normalizeText(row[2]);
        return registeredName === nama && registeredClass === kelas;
      });

      if (alreadyRegistered) {
        return htmlResponse({
          ok: false,
          message: 'Nama dan kelas ini sudah pernah mendaftar.',
        });
      }

      regSheet.appendRow([
        new Date(),
        String(body.name || '').trim(),
        String(body.class || '').trim(),
        alasan,
      ]);

      return htmlResponse({
        ok: true,
        message: 'Pendaftaran berhasil disimpan.',
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return htmlResponse({
      ok: false,
      message: 'Terjadi kesalahan saat menyimpan data.',
    });
  }
}

function getSpreadsheet() {
  const explicitId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (explicitId) {
    return SpreadsheetApp.openById(explicitId);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }

  throw new Error('SPREADSHEET_ID belum diatur dan script tidak terhubung ke spreadsheet.');
}

function isRegistrationWindowOpen(now = new Date()) {
  return now <= SCHEDULE_CLOSE;
}

function parseRequestBody(e) {
  if (!e) return {};

  if (e.parameter && Object.keys(e.parameter).length > 0) {
    return e.parameter;
  }

  if (e.postData && e.postData.contents) {
    const contents = String(e.postData.contents);

    try {
      return JSON.parse(contents);
    } catch (error) {
      const params = {};
      contents.split('&').forEach(pair => {
        if (!pair) return;
        const [rawKey, rawValue = ''] = pair.split('=');
        const key = decodeURIComponent(String(rawKey).replace(/\+/g, ' '));
        const value = decodeURIComponent(String(rawValue).replace(/\+/g, ' '));
        if (key) {
          params[key] = value;
        }
      });
      return params;
    }
  }

  return {};
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlResponse(payload) {
  const escaped = JSON.stringify({
    ok: Boolean(payload.ok),
    message: String(payload.message || ''),
  });

  return HtmlService.createHtmlOutput(
    `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
      (function () {
        var payload = ${escaped};
        try {
          if (window.parent) {
            window.parent.postMessage(payload, '*');
          }
        } catch (error) {}
      })();
    </script></body></html>`
  );
}
