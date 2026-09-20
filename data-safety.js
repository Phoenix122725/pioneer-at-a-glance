/* Pioneer at a Glance — Data Safety Guardrails
   Adds local safety snapshots, empty-data warnings, and clearer backup labels.
   This file stores safety snapshots only in this browser's localStorage.
*/
(() => {
  'use strict';

  const KE = {
    entries: 'pag.entries.v1',
    assign: 'pag.assign.v1',
    settings: 'pag.settings.v1',
    visits: 'pag.returnVisits.v1',
    onboard: 'pag.onboard.v1'
  };
  const LEGACY = {
    entries: 'pioneer.entries.v2',
    assign: 'pioneer.assignments.v2',
    settings: 'pioneer.settings.v2'
  };
  const HISTORY_KEY = 'pag.safetyHistory.v1';
  const EMPTY_DISMISS_KEY = 'pag.emptyDataNotice.dismissed.v1';
  const WATCHED = new Set([KE.entries, KE.assign, KE.settings, KE.visits]);

  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;

  function parse(raw, fallback) {
    try {
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function readStorage(storage, key, fallback) {
    return parse(originalGetItem.call(storage, key), fallback);
  }

  function currentData(storage = localStorage) {
    const currentEntries = readStorage(storage, KE.entries, null);
    const currentAssignments = readStorage(storage, KE.assign, null);
    const currentSettings = readStorage(storage, KE.settings, null);

    return {
      app: 'Pioneer at a Glance',
      safetyVersion: 1,
      savedAt: new Date().toISOString(),
      settings:
        currentSettings ??
        readStorage(storage, LEGACY.settings, {}) ??
        {},
      entries:
        currentEntries ??
        readStorage(storage, LEGACY.entries, []) ??
        [],
      assignments:
        currentAssignments ??
        readStorage(storage, LEGACY.assign, []) ??
        [],
      returnVisits: readStorage(storage, KE.visits, []) ?? []
    };
  }

  function recordCount(data) {
    return (
      (Array.isArray(data?.entries) ? data.entries.length : 0) +
      (Array.isArray(data?.assignments) ? data.assignments.length : 0) +
      (Array.isArray(data?.returnVisits) ? data.returnVisits.length : 0)
    );
  }

  function stablePayload(data) {
    try {
      return JSON.stringify({
        settings: data?.settings || {},
        entries: Array.isArray(data?.entries) ? data.entries : [],
        assignments: Array.isArray(data?.assignments) ? data.assignments : [],
        returnVisits: Array.isArray(data?.returnVisits) ? data.returnVisits : []
      });
    } catch (_) {
      return '';
    }
  }

  function readHistory(storage = localStorage) {
    const h = readStorage(storage, HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  }

  function writeHistory(history, storage = localStorage) {
    try {
      originalSetItem.call(storage, HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
    } catch (_) {}
  }

  function saveSnapshot(storage = localStorage) {
    try {
      const snap = currentData(storage);
      if (recordCount(snap) <= 0) return false;

      const history = readHistory(storage);
      const payload = stablePayload(snap);
      const duplicate = history.some(h => stablePayload(h) === payload);
      if (!duplicate) {
        history.unshift(snap);
        writeHistory(history, storage);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function bestSnapshot(storage = localStorage) {
    const history = readHistory(storage);
    if (!history.length) return null;
    return [...history].sort((a, b) => {
      const countDiff = recordCount(b) - recordCount(a);
      if (countDiff) return countDiff;
      return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
    })[0] || null;
  }

  // Before the app overwrites any primary data key, preserve the previous meaningful state.
  Storage.prototype.setItem = function(key, value) {
    try {
      if (this === localStorage && WATCHED.has(String(key))) {
        saveSnapshot(this);
      }
    } catch (_) {}
    return originalSetItem.call(this, key, value);
  };

  function lang() {
    const settings = readStorage(localStorage, KE.settings, {});
    if (settings?.language === 'es') return 'es';
    if (settings?.language === 'en') return 'en';
    return /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
  }

  function t(en, es) {
    return lang() === 'es' ? es : en;
  }

  function fmtDate(iso) {
    try {
      return new Intl.DateTimeFormat(lang() === 'es' ? 'es-US' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch (_) {
      return iso || '';
    }
  }

  function restoreSnapshot(snap) {
    if (!snap) return false;
    try {
      // Preserve whatever is currently there before restoring.
      saveSnapshot(localStorage);
      originalSetItem.call(localStorage, KE.entries, JSON.stringify(Array.isArray(snap.entries) ? snap.entries : []));
      originalSetItem.call(localStorage, KE.assign, JSON.stringify(Array.isArray(snap.assignments) ? snap.assignments : []));
      originalSetItem.call(localStorage, KE.visits, JSON.stringify(Array.isArray(snap.returnVisits) ? snap.returnVisits : []));
      originalSetItem.call(localStorage, KE.settings, JSON.stringify(snap.settings || {}));
      return true;
    } catch (_) {
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('pagSafetyStyles')) return;
    const style = document.createElement('style');
    style.id = 'pagSafetyStyles';
    style.textContent = `
      .pag-safety-card{border:1px solid #b9cfc0;background:var(--sage2,#eef4ef);border-radius:17px;padding:14px;margin-top:12px}
      .pag-safety-card h2{margin:0 0 6px;font-size:1rem}
      .pag-safety-status{font-size:.78rem;color:var(--muted,#748078);line-height:1.45;margin:5px 0 10px}
      .pag-safety-actions{display:grid;gap:7px}
      .pag-safety-modal{position:fixed;inset:0;z-index:9999;background:rgba(24,36,30,.62);display:flex;align-items:center;justify-content:center;padding:18px}
      .pag-safety-box{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--panel,#fffdf9);color:var(--ink,#26362f);border:1px solid var(--line,#d9dfda);border-radius:20px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
      .pag-safety-box h2{font-family:Georgia,serif;margin:0 0 8px}
      .pag-safety-box p{font-size:.9rem;line-height:1.5;margin:8px 0;color:var(--ink,#26362f)}
      .pag-safety-box .pag-muted{color:var(--muted,#748078);font-size:.8rem}
      .pag-safety-box .pag-actions{display:grid;gap:8px;margin-top:14px}
      .pag-safety-box button{min-height:44px;border:1px solid var(--line,#d9dfda);background:var(--card,#fff);color:var(--ink,#26362f);border-radius:11px;padding:10px 12px;font-weight:800}
      .pag-safety-box button.pag-primary{background:var(--green,#315746);color:white;border-color:var(--green,#315746)}
      html[data-theme="dark"] .pag-safety-card{background:var(--sage2,#1a2d24);border-color:var(--line,#34443a)}
      html[data-theme="dark"] .pag-safety-box{background:var(--panel,#17201b);color:var(--ink,#edf4ef)}
    `;
    document.head.appendChild(style);
  }

  function clarifyBackupLabels() {
    const backup = document.getElementById('backupJsonBtn');
    const csv = document.getElementById('exportCsvBtn');
    const restoreInput = document.getElementById('restoreJsonFile');
    const importCsv = document.getElementById('importFile');

    if (backup) {
      backup.removeAttribute('data-i18n');
      backup.textContent = t('Download Complete App Backup (.JSON)', 'Descargar copia completa de la app (.JSON)');
    }
    if (csv) {
      csv.removeAttribute('data-i18n');
      csv.textContent = t('Export Ministry Spreadsheet (.CSV)', 'Exportar hoja de cálculo del ministerio (.CSV)');
    }
    if (restoreInput?.parentElement) {
      const label = restoreInput.parentElement;
      label.removeAttribute('data-i18n');
      const textNode = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.nodeValue = t('Restore Complete App Backup (.JSON) ', 'Restaurar copia completa de la app (.JSON) ');
      }
    }
    if (importCsv?.parentElement) {
      const label = importCsv.parentElement;
      label.removeAttribute('data-i18n');
      const textNode = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.nodeValue = t('Import Spreadsheet (.CSV) ', 'Importar hoja de cálculo (.CSV) ');
      }
    }
  }

  function safetyStatusText() {
    const snap = bestSnapshot();
    if (!snap) {
      return t(
        'No automatic safety copy yet. One will be created after you save ministry data on this device.',
        'Todavía no hay una copia de seguridad automática. Se creará después de guardar datos del ministerio en este dispositivo.'
      );
    }
    return t(
      `Automatic safety copy available: ${recordCount(snap)} saved records • ${fmtDate(snap.savedAt)}`,
      `Copia de seguridad automática disponible: ${recordCount(snap)} registros guardados • ${fmtDate(snap.savedAt)}`
    );
  }

  function renderSafetyCard() {
    const more = document.getElementById('moreScreen');
    if (!more) return;

    let card = document.getElementById('pagSafetyCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'pagSafetyCard';
      card.className = 'pag-safety-card';

      const backupCard = document.getElementById('backupJsonBtn')?.closest('.card');
      if (backupCard?.parentNode) backupCard.parentNode.insertBefore(card, backupCard.nextSibling);
      else more.appendChild(card);
    }

    card.innerHTML = `
      <h2>${t('Data Safety', 'Seguridad de datos')}</h2>
      <div class="pag-safety-status" id="pagSafetyStatus">${safetyStatusText()}</div>
      <div class="pag-safety-actions">
        <button type="button" class="btn primary" id="pagSafetyBackup">${t('Download Complete Backup (.JSON)', 'Descargar copia completa (.JSON)')}</button>
        <button type="button" class="btn" id="pagSafetyRestoreFile">${t('Restore Backup File (.JSON)', 'Restaurar archivo de copia (.JSON)')}</button>
        <button type="button" class="btn" id="pagSafetyRestoreAuto">${t('Restore Automatic Safety Copy', 'Restaurar copia automática')}</button>
      </div>
      <div class="pag-safety-status">
        ${t(
          'Safety copies stay on this device. A downloaded .JSON backup is the best protection if you change phones, browsers, or website addresses.',
          'Las copias automáticas permanecen en este dispositivo. Una copia .JSON descargada es la mejor protección si cambias de teléfono, navegador o dirección web.'
        )}
      </div>
    `;

    document.getElementById('pagSafetyBackup')?.addEventListener('click', () => {
      saveSnapshot();
      document.getElementById('backupJsonBtn')?.click();
      setTimeout(renderSafetyCard, 150);
    });

    document.getElementById('pagSafetyRestoreFile')?.addEventListener('click', () => {
      document.getElementById('restoreJsonFile')?.click();
    });

    document.getElementById('pagSafetyRestoreAuto')?.addEventListener('click', () => {
      const snap = bestSnapshot();
      if (!snap) {
        alert(t('No automatic safety copy is available yet.', 'Todavía no hay una copia automática disponible.'));
        return;
      }
      const ok = confirm(t(
        `Restore the safety copy with ${recordCount(snap)} saved records from ${fmtDate(snap.savedAt)}?`,
        `¿Restaurar la copia automática con ${recordCount(snap)} registros guardados del ${fmtDate(snap.savedAt)}?`
      ));
      if (ok && restoreSnapshot(snap)) location.reload();
    });
  }

  function closeEmptyModal(dismiss = false) {
    document.getElementById('pagEmptyDataModal')?.remove();
    if (dismiss) {
      try {
        originalSetItem.call(localStorage, EMPTY_DISMISS_KEY, 'yes');
      } catch (_) {}
    }
  }

  function showEmptyDataWarning() {
    if (recordCount(currentData()) > 0) return;
    if (originalGetItem.call(localStorage, EMPTY_DISMISS_KEY) === 'yes') return;
    if (document.getElementById('pagEmptyDataModal')) return;

    const snap = bestSnapshot();
    const modal = document.createElement('div');
    modal.id = 'pagEmptyDataModal';
    modal.className = 'pag-safety-modal';

    const found = snap && recordCount(snap) > 0;
    modal.innerHTML = `
      <div class="pag-safety-box" role="dialog" aria-modal="true" aria-labelledby="pagSafetyTitle">
        <h2 id="pagSafetyTitle">${t('Your data may still be safe', 'Tus datos todavía pueden estar seguros')}</h2>
        <p>${
          found
            ? t(
                `This app looks empty, but I found an automatic safety copy with ${recordCount(snap)} saved records on this device.`,
                `La app aparece vacía, pero encontré una copia automática con ${recordCount(snap)} registros guardados en este dispositivo.`
              )
            : t(
                'No ministry records are visible in this browser right now. If you have used Pioneer at a Glance before, do not re-enter everything or clear browser data yet.',
                'Ahora mismo no se ven registros del ministerio en este navegador. Si ya usabas Pioneer at a Glance, no vuelvas a ingresar todo ni borres los datos del navegador todavía.'
              )
        }</p>
        <p class="pag-muted">${t(
          'Changing phones, browsers, or website addresses can make locally stored data appear empty even when an older copy still exists.',
          'Cambiar de teléfono, navegador o dirección web puede hacer que los datos guardados localmente parezcan vacíos aunque todavía exista una copia anterior.'
        )}</p>
        <div class="pag-actions">
          ${found ? `<button class="pag-primary" id="pagRestoreFound">${t('Restore My Safety Copy', 'Restaurar mi copia de seguridad')}</button>` : ''}
          <button class="${found ? '' : 'pag-primary'}" id="pagRestoreFile">${t('Restore a .JSON Backup', 'Restaurar una copia .JSON')}</button>
          <button id="pagStartFresh">${t("I'm new / Continue with an empty app", 'Soy nuevo(a) / Continuar con la app vacía')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('pagRestoreFound')?.addEventListener('click', () => {
      if (restoreSnapshot(snap)) location.reload();
    });
    document.getElementById('pagRestoreFile')?.addEventListener('click', () => {
      document.getElementById('restoreJsonFile')?.click();
    });
    document.getElementById('pagStartFresh')?.addEventListener('click', () => closeEmptyModal(true));
  }

  function refreshUI() {
    clarifyBackupLabels();
    renderSafetyCard();
  }

  // If a full JSON restore succeeds through the app's existing handler, close the warning.
  function watchRestoreInput() {
    const input = document.getElementById('restoreJsonFile');
    if (!input || input.dataset.safetyWatched) return;
    input.dataset.safetyWatched = '1';
    input.addEventListener('change', () => {
      setTimeout(() => {
        if (recordCount(currentData()) > 0) {
          saveSnapshot();
          closeEmptyModal(false);
          refreshUI();
        }
      }, 900);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    injectStyles();

    // Save the currently healthy state as soon as the app has finished loading.
    setTimeout(() => {
      saveSnapshot();
      refreshUI();
      watchRestoreInput();
      showEmptyDataWarning();
    }, 250);

    // Re-apply labels after Settings changes language.
    document.getElementById('saveSettings')?.addEventListener('click', () => {
      setTimeout(refreshUI, 100);
    });

    // Periodically retain a healthy local state without uploading anything.
    setInterval(() => {
      saveSnapshot();
      const status = document.getElementById('pagSafetyStatus');
      if (status) status.textContent = safetyStatusText();
    }, 30000);
  });
})();
