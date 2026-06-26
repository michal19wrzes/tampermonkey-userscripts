// ==UserScript==
// @name         Registry Records - Accept From Card Search v1.6
// @namespace    registry-workflow-sanitized
// @version      1.6
// @description  Adds an Accept action to a card-search modal and creates a single registry entry from the selected row.
// @match        https://example.registry.local/app/records/create-collected/*
// @grant        none
// @author       Michal Nogal
// ==/UserScript==

// Public portfolio version: system name and production domain are anonymized.
// Replace @match domains and endpoint paths only in environments where you are authorized to automate the workflow.

(function () {
    'use strict';

    const DEBUG = false;

    const MODAL_SELECTOR = '.ReactModal__Content';
    const TABLE_SELECTOR = `${MODAL_SELECTOR} table.table.table-striped.table-hover.table-sorting`;
    const BTN_CLASS = 'registry-accept-kpo-btn';
    const CUSTOM_CELL_CLASS = 'registry-custom-action-cell';
    const CUSTOM_HEADER_CLASS = 'registry-custom-action-header';

    const pendingCards = new Set();
    const acceptedCards = new Set();

    let enhanceTimer = null;
    let lastKnownPage = null;

    function log(...args) {
        if (DEBUG) console.log('[Registry record ACCEPT]', ...args);
    }

    function normalizeSpaces(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function normalizeCardNumber(value) {
        return normalizeSpaces(value)
            .replace(/\s+/g, '')
            .replace(/[–—]/g, '-')
            .toUpperCase();
    }

    function parsePolishNumber(value) {
        if (value == null) return null;
        const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
        const num = Number(text);
        return Number.isFinite(num) ? num : null;
    }

    function getCurrentWasteRecordCardId() {
        const match = window.location.pathname.match(/\/Create\/CollectedWaste\/([^/?#]+)/i);
        return match ? match[1] : null;
    }

    function getCurrentWasteCodeName() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('wasteCodeName');
        if (fromQuery) return fromQuery.trim();

        const input = document.querySelector('#wasteCodeName');
        if (input && input.value) return input.value.trim();

        return '';
    }

    function getSelectedYears() {
        const values = Array.from(document.querySelectorAll('input[name="year"]'))
            .map(el => String(el.value || '').trim())
            .filter(Boolean);

        if (values.length) return values;

        return [String(new Date().getFullYear())];
    }

    function getUsedOnlyValue() {
        const checked = document.querySelector('input[name="usedOnly"]:checked');
        if (!checked) return false;
        return String(checked.value).toLowerCase() === 'true';
    }

    function getCurrentPageSize() {
        const table = findTable();
        if (!table) return 10;

        const rows = table.querySelectorAll('tbody tr');
        return rows.length || 10;
    }

    function getCurrentResultsPage() {
        const modal = document.querySelector(MODAL_SELECTOR);
        if (!modal) return 1;

        const selectors = [
            '[aria-current="page"]',
            '.active a',
            '.active button',
            '.pagination .active',
            '.selected',
            '.page-item.active',
            '.rc-pagination-item-active',
            '.Pagination__ActivePage'
        ];

        for (const selector of selectors) {
            const el = modal.querySelector(selector);
            if (!el) continue;

            const text = normalizeSpaces(el.textContent);
            const match = text.match(/\d+/);
            if (match) return Number(match[0]);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const pageFromUrl = urlParams.get('pageNumber') || urlParams.get('page');
        if (pageFromUrl && /^\d+$/.test(pageFromUrl)) {
            return Number(pageFromUrl);
        }

        return 1;
    }

    function clearAcceptedIfPageChanged() {
        const currentPage = getCurrentResultsPage();

        if (lastKnownPage === null) {
            lastKnownPage = currentPage;
            return;
        }

        if (lastKnownPage !== currentPage) {
            acceptedCards.clear();
            lastKnownPage = currentPage;
            log('Reset acceptedCards after page change:', currentPage);
        }
    }

    function findTable() {
        return document.querySelector(TABLE_SELECTOR);
    }

    function getHeaderTexts(table) {
        return Array.from(table.querySelectorAll('thead th')).map(th => normalizeSpaces(th.textContent));
    }

    function getColumnIndex(headers, predicate) {
        return headers.findIndex(predicate);
    }

    function getRowData(row, table) {
        const headers = getHeaderTexts(table);
        const cells = Array.from(row.querySelectorAll('td'));

        if (!cells.length) return null;

        const idxCardNumber = getColumnIndex(headers, h => h === 'Numer karty');
        const idxDate = getColumnIndex(headers, h => h === 'Data przekazania');
        const idxMass = getColumnIndex(headers, h => h.includes('Masa odpadów w tonach'));

        const cardNumber = idxCardNumber >= 0 && cells[idxCardNumber]
            ? normalizeSpaces(cells[idxCardNumber].textContent)
            : '';

        const collectionDate = idxDate >= 0 && cells[idxDate]
            ? normalizeSpaces(cells[idxDate].textContent)
            : '';

        const collectedWasteMass = idxMass >= 0 && cells[idxMass]
            ? parsePolishNumber(cells[idxMass].textContent)
            : null;

        return {
            cardNumber,
            normalizedCardNumber: normalizeCardNumber(cardNumber),
            collectionDate,
            collectedWasteMass
        };
    }

    function ensureHeaderCell(table) {
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;

        if (headerRow.querySelector(`th.${CUSTOM_HEADER_CLASS}`)) return;

        const th = document.createElement('th');
        th.className = CUSTOM_HEADER_CLASS;
        th.textContent = '';
        th.style.width = '120px';
        headerRow.insertBefore(th, headerRow.firstChild);
    }

    function setBtnDefault(btn) {
        btn.textContent = 'Akceptuj';
        btn.disabled = false;
        btn.classList.remove('btn-success', 'btn-danger');
        btn.classList.add('btn-primary');
    }

    function setBtnLoading(btn) {
        btn.textContent = 'Trwa...';
        btn.disabled = true;
        btn.classList.remove('btn-success', 'btn-danger');
        btn.classList.add('btn-primary');
    }

    function setBtnSuccess(btn) {
        btn.textContent = 'Dodano ✓';
        btn.disabled = true;
        btn.classList.remove('btn-primary', 'btn-danger');
        btn.classList.add('btn-success');
    }

    function setBtnError(btn) {
        btn.textContent = 'Błąd ✗';
        btn.disabled = false;
        btn.classList.remove('btn-primary', 'btn-success');
        btn.classList.add('btn-danger');
    }

    function ensureRowButton(row, table) {
        if (!(row instanceof HTMLTableRowElement)) return;

        let actionCell = row.querySelector(`td.${CUSTOM_CELL_CLASS}`);
        if (!actionCell) {
            actionCell = document.createElement('td');
            actionCell.className = CUSTOM_CELL_CLASS;
            actionCell.style.verticalAlign = 'middle';
            actionCell.style.whiteSpace = 'nowrap';
            actionCell.style.minWidth = '110px';
            row.insertBefore(actionCell, row.firstChild);
        }

        let btn = actionCell.querySelector(`button.${BTN_CLASS}`);
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn btn-sm btn-primary ${BTN_CLASS}`;
            btn.style.width = '95px';
            actionCell.appendChild(btn);
        }

        const rowData = getRowData(row, table);
        if (rowData && rowData.cardNumber) {
            btn.dataset.cardNumber = rowData.cardNumber;
            btn.dataset.normalizedCardNumber = rowData.normalizedCardNumber;
        }

        if (rowData && acceptedCards.has(rowData.normalizedCardNumber)) {
            setBtnSuccess(btn);
        } else if (rowData && pendingCards.has(rowData.normalizedCardNumber)) {
            setBtnLoading(btn);
        } else {
            setBtnDefault(btn);
        }
    }

    function enhanceTable(table) {
        if (!table) return;
        ensureHeaderCell(table);
        table.querySelectorAll('tbody tr').forEach(row => ensureRowButton(row, table));
    }

    function scheduleEnhance() {
        if (enhanceTimer) clearTimeout(enhanceTimer);
        enhanceTimer = setTimeout(() => {
            clearAcceptedIfPageChanged();
            const table = findTable();
            if (table) enhanceTable(table);
        }, 120);
    }

    async function fetchKpoIdForCard(cardNumber) {
        const wasteCodeName = getCurrentWasteCodeName();
        const years = getSelectedYears();
        const usedOnly = getUsedOnlyValue();
        const currentPage = getCurrentResultsPage();
        const pageSize = getCurrentPageSize();
        const normalizedTarget = normalizeCardNumber(cardNumber);

        if (!wasteCodeName) {
            throw new Error('Nie udało się odczytać wasteCodeName.');
        }

        for (const year of years) {
            const requestBody = {
                year,
                pageSize,
                wasteCodeName,
                usedOnly
            };

            if (currentPage > 1) {
                requestBody.pageNumber = currentPage;
            }

            const response = await fetch('/api/cards/receiver-search', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Błąd pobierania listy card: HTTP ${response.status}`);
            }

            const json = await response.json();
            const items = Array.isArray(json.items) ? json.items : [];

            const found = items.find(item =>
                normalizeCardNumber(item.cardNumber) === normalizedTarget
            );

            log('Receiver request:', requestBody);
            log('Found on page:', currentPage, !!found);

            if (found && found.kpoId) {
                return String(found.kpoId).trim();
            }
        }

        throw new Error(`Nie znaleziono kpoId dla numeru karty na stronie ${currentPage}.`);
    }

    function buildCreateCollectedPayload(row, table, kpoCardId) {
        const wasteRecordCardId = getCurrentWasteRecordCardId();
        const wasteCodeName = getCurrentWasteCodeName();
        const rowData = getRowData(row, table);

        if (!wasteRecordCardId) {
            throw new Error('Nie udało się odczytać wasteRecordCardId z URL.');
        }

        if (!wasteCodeName) {
            throw new Error('Nie udało się odczytać wasteCodeName.');
        }

        if (!rowData || !rowData.cardNumber) {
            throw new Error('Nie udało się odczytać numeru karty z wiersza.');
        }

        if (!kpoCardId) {
            throw new Error('Brak kpoCardId.');
        }

        if (rowData.collectedWasteMass == null) {
            throw new Error('Nie udało się odczytać masy z wiersza.');
        }

        return {
            wasteRecordCardId,
            wasteCodeName,
            collectionWay: 'BASED_ON_card_CARD',
            kpoCardId,
            kpoCardNumber: rowData.cardNumber,
            collectionDate: rowData.collectionDate,
            collectedWasteMass: rowData.collectedWasteMass,
            _fetching: Date.now(),
            _fetching_error: false
        };
    }

    async function postCreateCollected(payload) {
        const response = await fetch('/api/records/create-collected', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        let json = null;
        try {
            json = await response.clone().json();
        } catch (_) {}

        if (!response.ok) {
            const message =
                (json && (json.message || json.error || json.title)) ||
                `HTTP ${response.status}`;
            throw new Error(message);
        }

        return json;
    }

    async function refreshCollectedItems() {
        const wasteRecordCardId = getCurrentWasteRecordCardId();
        if (!wasteRecordCardId) return;

        try {
            await fetch('/api/records/get-collected-items', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({ wasteRecordCardId })
            });
        } catch (err) {
            log('GetCollectedItems refresh failed:', err);
        }
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest(`button.${BTN_CLASS}`);
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const row = btn.closest('tr');
        const table = findTable();

        if (!row || !table) return;

        const rowData = getRowData(row, table);
        if (!rowData || !rowData.cardNumber) {
            alert('Nie udało się odczytać danych z wiersza.');
            return;
        }

        if (pendingCards.has(rowData.normalizedCardNumber)) return;

        try {
            pendingCards.add(rowData.normalizedCardNumber);
            setBtnLoading(btn);

            const kpoCardId = await fetchKpoIdForCard(rowData.cardNumber);
            const payload = buildCreateCollectedPayload(row, table, kpoCardId);

            log('CreateCollected payload:', payload);

            await postCreateCollected(payload);
            await refreshCollectedItems();

            pendingCards.delete(rowData.normalizedCardNumber);
            acceptedCards.add(rowData.normalizedCardNumber);
            setBtnSuccess(btn);
        } catch (err) {
            console.error('[Registry] CreateCollected error:', err);
            pendingCards.delete(rowData.normalizedCardNumber);
            setBtnError(btn);
            alert(`Błąd podczas dodawania karty:\n${err.message}`);
        }
    }, true);

    const observer = new MutationObserver(() => {
        scheduleEnhance();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    scheduleEnhance();
    setTimeout(scheduleEnhance, 400);
    setTimeout(scheduleEnhance, 1000);
    setTimeout(scheduleEnhance, 2000);
})();