// ==UserScript==
// @name         Registry Records - Extra Info Panel v4.0
// @namespace    registry-workflow-sanitized
// @version      4.0
// @description  Adds an extra-info fetch button to a registry table and displays row-level details fetched from the application backend.
// @match        https://example.registry.local/app/records/details-collected/*
// @grant        none
// @author       Michal Nogal
// ==/UserScript==

// Public portfolio version: system name and production domain are anonymized.
// Replace @match domains and endpoint paths only in environments where you are authorized to automate the workflow.

(function () {
    'use strict';

    const TABLE_SELECTOR = '#table-waste-list';
    const EDIT_LINK_SELECTOR = "a[title='Edycja']";
    const BTN_CLASS = 'registry-fetch-btn';
    const CUSTOM_CELL_CLASS = 'registry-custom-cell';
    const CUSTOM_HEADER_CLASS = 'registry-custom-header';
    const INFO_ROW_CLASS = 'registry-additional-info-row';
    const DEBUG = false;

    const detailsCache = new Map(); // collectedId -> additionalInformations
    const pendingRequests = new Set(); // collectedId aktualnie pobierane
    let enhanceTimer = null;

    function log(...args) {
        if (DEBUG) console.log('[Registry]', ...args);
    }

    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            column: params.get('column') || '',
            order: params.get('order') || ''
        };
    }

    function hasProperDomSorting(table) {
        if (!table) return false;

        const headers = Array.from(table.querySelectorAll('thead th'));
        const targetHeader = headers.find(th =>
            th.textContent.replace(/\s+/g, ' ').trim() === 'Informacja o sposobie przyjęcia odpadów'
        );

        if (!targetHeader) return false;

        return targetHeader.classList.contains('sorting-desc');
    }
    function shouldEnhance() {
        return true;
    }
    //function shouldEnhance(table) {
    //    const { column, order } = getUrlParams();
    //    if (column !== 'CollectionWay') return false;
    //    if (order !== 'desc') return false;
    //    if (!hasProperDomSorting(table)) return false;
    //    return true;
    //}

    function getCollectedIdFromEditHref(href) {
        const absolute = new URL(href, window.location.origin).href;
        const clean = absolute.split('?')[0].replace(/\/$/, '');
        return clean.split('/').pop();
    }

    function getRowCollectedId(row) {
        const editLink = row.querySelector(EDIT_LINK_SELECTOR);
        if (!editLink) return null;
        const href = editLink.getAttribute('href');
        if (!href) return null;
        return getCollectedIdFromEditHref(href);
    }

    function ensureHeaderCell(table) {
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;

        if (headerRow.querySelector(`.${CUSTOM_HEADER_CLASS}`)) return;

        const th = document.createElement('th');
        th.className = CUSTOM_HEADER_CLASS;
        th.style.width = '190px';
        th.textContent = '';
        headerRow.insertBefore(th, headerRow.firstChild);
    }

    function removeHeaderCell(table) {
        table.querySelectorAll(`.${CUSTOM_HEADER_CLASS}`).forEach(el => el.remove());
    }

    function removeInfoRowByCollectedId(tbody, collectedId) {
        if (!tbody || !collectedId) return;
        tbody.querySelectorAll(`tr.${INFO_ROW_CLASS}[data-collected-id="${collectedId}"]`).forEach(el => el.remove());
    }

    function createInfoRow(baseRow, value, collectedId) {
        const infoRow = document.createElement('tr');
        infoRow.className = INFO_ROW_CLASS;
        infoRow.dataset.collectedId = collectedId;

        const td = document.createElement('td');
        td.colSpan = baseRow.children.length;
        td.style.padding = '8px';
        td.style.backgroundColor = '#eef7ff';
        td.style.fontStyle = 'italic';
        td.style.whiteSpace = 'normal';
        td.style.wordBreak = 'break-word';

        const strong = document.createElement('strong');
        strong.textContent = 'Informacje dodatkowe: ';
        td.appendChild(strong);
        td.appendChild(document.createTextNode(value || 'Brak danych'));

        infoRow.appendChild(td);
        return infoRow;
    }

    function setButtonDefault(btn) {
        btn.textContent = 'Pobierz dane';
        btn.disabled = false;
        btn.classList.remove('btn-success');
        btn.classList.add('btn-info');
        btn.dataset.state = 'default';
    }

    function setButtonLoading(btn) {
        btn.textContent = 'Pobieranie...';
        btn.disabled = true;
        btn.classList.remove('btn-success');
        btn.classList.add('btn-info');
        btn.dataset.state = 'loading';
    }

    function setButtonSuccess(btn) {
        btn.textContent = 'Pobrano';
        btn.disabled = true;
        btn.classList.remove('btn-info');
        btn.classList.add('btn-success');
        btn.dataset.state = 'success';
    }

    async function fetchCollectedDetails(itemId) {
        try {
            const response = await fetch('/api/records/get-collected', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    wasteRecordCardItemId: itemId
                })
            });

            if (!response.ok) {
                throw new Error(`Błąd pobierania danych: ${response.status}`);
            }

            const json = await response.json();
            log('GetCollected response:', json);

            return (json && typeof json.additionalInformations === 'string' && json.additionalInformations.trim())
                ? json.additionalInformations.trim()
                : 'Brak danych';
        } catch (err) {
            console.error('[Registry] Błąd GetCollected:', err);
            return 'Błąd pobierania danych';
        }
    }

    function ensureRowButton(row) {
        if (!(row instanceof HTMLTableRowElement)) return;
        if (row.classList.contains(INFO_ROW_CLASS)) return;

        const editLink = row.querySelector(EDIT_LINK_SELECTOR);
        if (!editLink) return;

        let actionCell = row.querySelector(`td.${CUSTOM_CELL_CLASS}`);
        if (!actionCell) {
            actionCell = document.createElement('td');
            actionCell.className = CUSTOM_CELL_CLASS;
            actionCell.style.verticalAlign = 'top';
            actionCell.style.whiteSpace = 'normal';
            actionCell.style.minWidth = '190px';
            row.insertBefore(actionCell, row.firstChild);
        }

        let fetchBtn = actionCell.querySelector(`button.${BTN_CLASS}`);
        if (!fetchBtn) {
            fetchBtn = document.createElement('button');
            fetchBtn.type = 'button';
            fetchBtn.className = `btn btn-sm btn-info ${BTN_CLASS}`;
            fetchBtn.style.display = 'block';
            fetchBtn.style.width = '180px';
            fetchBtn.style.marginBottom = '6px';
            actionCell.appendChild(fetchBtn);
        }

        const collectedId = getRowCollectedId(row);
        if (!collectedId) return;

        fetchBtn.dataset.collectedId = collectedId;

        if (pendingRequests.has(collectedId)) {
            setButtonLoading(fetchBtn);
        } else if (detailsCache.has(collectedId)) {
            setButtonSuccess(fetchBtn);
        } else {
            setButtonDefault(fetchBtn);
        }
    }

    function enhanceTable(table) {
        if (!table) return;

        if (!shouldEnhance(table)) {
            removeHeaderCell(table);
            table.querySelectorAll(`td.${CUSTOM_CELL_CLASS}`).forEach(el => el.remove());
            table.querySelectorAll(`tr.${INFO_ROW_CLASS}`).forEach(el => el.remove());
            return;
        }

        ensureHeaderCell(table);
        table.querySelectorAll('tbody tr').forEach(ensureRowButton);
    }

    function restoreInfoRows(table) {
        if (!table || !shouldEnhance(table)) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        Array.from(tbody.querySelectorAll(`tr.${INFO_ROW_CLASS}`)).forEach(el => el.remove());

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => !row.classList.contains(INFO_ROW_CLASS));

        rows.forEach(row => {
            const collectedId = getRowCollectedId(row);
            if (!collectedId) return;
            if (!detailsCache.has(collectedId)) return;

            const value = detailsCache.get(collectedId);
            const infoRow = createInfoRow(row, value, collectedId);
            row.parentNode.insertBefore(infoRow, row.nextSibling);
        });
    }

    function scheduleEnhance() {
        if (enhanceTimer) clearTimeout(enhanceTimer);
        enhanceTimer = setTimeout(() => {
            const table = document.querySelector(TABLE_SELECTOR);
            if (!table) return;
            enhanceTable(table);
            restoreInfoRows(table);
        }, 120);
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest(`button.${BTN_CLASS}`);
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const table = document.querySelector(TABLE_SELECTOR);
        if (!table || !shouldEnhance(table)) return;

        const collectedId = btn.dataset.collectedId;
        if (!collectedId) return;
        if (btn.disabled) return;
        if (pendingRequests.has(collectedId)) return;

        const row = btn.closest('tr');
        if (!row) return;

        setButtonLoading(btn);
        pendingRequests.add(collectedId);

        try {
            const additionalInformations = await fetchCollectedDetails(collectedId);

            if (additionalInformations === 'Błąd pobierania danych') {
                pendingRequests.delete(collectedId);
                setButtonDefault(btn);
                alert('Błąd pobierania danych.');
                return;
            }

            detailsCache.set(collectedId, additionalInformations);
            pendingRequests.delete(collectedId);

            const tbody = row.parentNode;
            removeInfoRowByCollectedId(tbody, collectedId);

            const infoRow = createInfoRow(row, additionalInformations, collectedId);
            row.parentNode.insertBefore(infoRow, row.nextSibling);

            setButtonSuccess(btn);
        } catch (err) {
            console.error('[Registry] Klik / pobieranie:', err);
            pendingRequests.delete(collectedId);
            setButtonDefault(btn);
            alert('Błąd pobierania danych.');
        }
    }, true);

    const observer = new MutationObserver(() => {
        scheduleEnhance();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            scheduleEnhance();
        }
    }, 300);

    scheduleEnhance();
    setTimeout(scheduleEnhance, 400);
    setTimeout(scheduleEnhance, 1000);
    setTimeout(scheduleEnhance, 2000);
})();