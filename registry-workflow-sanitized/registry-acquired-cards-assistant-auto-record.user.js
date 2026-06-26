// ==UserScript==
// @name         Registry Acquired Cards Assistant v1.8 + Auto Record
// @namespace    registry-workflow-sanitized
// @version      1.8
// @description  Adds workflow actions to acquired-card tables and optionally creates a related registry entry after acceptance.
// @match        https://example.registry.local/app/acquired-cards/generated*
// @match        https://example.registry.local/app/acquired-cards/edit-generated/*
// @grant        none
// @author       Michal Nogal
// ==/UserScript==

// Public portfolio version: system name and production domain are anonymized.
// Replace @match domains and endpoint paths only in environments where you are authorized to automate the workflow.

(function () {
    'use strict';

    const DEBUG = false;

    function log(...args) {
        if (DEBUG) console.log('[Registry PRZEJMUJACY + record]', ...args);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    function normalizeWasteCode(value) {
        const text = normalizeSpaces(value);
        const match = text.match(/^\d{2}\s\d{2}\s\d{2}\*?/);
        return match ? match[0] : text;
    }

    function extractDateOnly(value) {
        return normalizeSpaces(value).split(' ')[0] || '';
    }

    function parsePolishNumber(value) {
        if (value == null) return null;
        const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
        const num = Number(text);
        return Number.isFinite(num) ? num : null;
    }

    function getKpoYearFromCardNumber(cardNumber) {
        const match = String(cardNumber || '').match(/\/(\d{4})\/card\//i);
        return match ? match[1] : null;
    }

    function getKeoYear() {
        const params = new URLSearchParams(window.location.search);

        const fromQuery = params.get('year');
        if (fromQuery && /^\d{4}$/.test(fromQuery)) {
            return fromQuery;
        }

        const selected = document.querySelector('input[name="year"]:checked');
        if (selected && /^\d{4}$/.test(String(selected.value || '').trim())) {
            return String(selected.value).trim();
        }

        const anyYearInput = document.querySelector('input[name="year"]');
        if (anyYearInput && /^\d{4}$/.test(String(anyYearInput.value || '').trim())) {
            return String(anyYearInput.value).trim();
        }

        const match = window.location.href.match(/[?&]year=(\d{4})/i);
        if (match) {
            return match[1];
        }

        return String(new Date().getFullYear());
    }

    async function fetchMassAndAddressFromCard(url) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error('Nie udało się pobrać karty');

            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            const massElem = doc.querySelector('#WasteMass');
            const mass = massElem ? massElem.value.trim() : 'Brak masy';

            const address = findAddressByLabel(doc, 'Adres miejsca prowadzenia działalności');

            const carrierInput = doc.querySelector('#CarrierName');
            let carrierName = 'Brak nazwy transportującego';
            if (carrierInput) {
                carrierName = carrierInput.value.trim().replace(/&quot;/g, '"');
            }

            return { mass, address, carrierName };
        } catch (err) {
            console.error(err);
            return { mass: 'Błąd', address: 'Błąd', carrierName: 'Błąd' };
        }
    }

    function findAddressByLabel(doc, labelText) {
        const labels = Array.from(doc.querySelectorAll('label'));
        const targetLabel = labels.find(label => normalizeSpaces(label.textContent) === labelText);
        if (!targetLabel) return 'Brak adresu';

        const formGroup = targetLabel.closest('.form-group');
        if (!formGroup) return 'Brak adresu';

        const addressDiv = formGroup.querySelector('div.form-control');
        return addressDiv ? addressDiv.innerText.trim() : 'Brak adresu';
    }

    function removeColumns(table) {
        const headerCells = table.querySelectorAll('thead th');
        let kodExIndex = -1;

        headerCells.forEach((th, idx) => {
            if (normalizeSpaces(th.textContent) === 'Kod ex') kodExIndex = idx;
        });

        if (kodExIndex !== -1) {
            headerCells[kodExIndex].remove();
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[kodExIndex]) cells[kodExIndex].remove();
            });
        }
    }

    function getColumnIndexByHeader(table, headerText) {
        const headers = Array.from(table.querySelectorAll('thead th'));
        return headers.findIndex(th =>
            normalizeSpaces(th.textContent).includes(headerText)
        );
    }

    function getRowTransferData(row, table) {
        const cells = Array.from(row.querySelectorAll('td'));

        const cardIdx = getColumnIndexByHeader(table, 'Numer karty');
        const dateIdx = getColumnIndexByHeader(table, 'Data i godzina rozpoczęcia transportu');
        const wasteCodeIdx = getColumnIndexByHeader(table, 'Kod odpadu');

        if (cardIdx < 0 || dateIdx < 0 || wasteCodeIdx < 0) {
            throw new Error('Nie znaleziono wymaganych kolumn w tabeli.');
        }

        const cardCell = cells[cardIdx];
        const dateCell = cells[dateIdx];
        const wasteCodeCell = cells[wasteCodeIdx];

        const kpoCardNumber =
            normalizeSpaces(cardCell?.getAttribute('data-original-title')) ||
            normalizeSpaces(cardCell?.textContent);

        const wasteCode = normalizeWasteCode(wasteCodeCell?.textContent || '');
        const transportDateTime = normalizeSpaces(dateCell?.textContent || '');
        const collectionDate = extractDateOnly(transportDateTime);

        if (!kpoCardNumber) {
            throw new Error('Nie udało się odczytać pełnego numeru card z tabeli.');
        }

        if (!wasteCode) {
            throw new Error('Nie udało się odczytać kodu odpadu z tabeli.');
        }

        if (!collectionDate) {
            throw new Error('Nie udało się odczytać daty z tabeli.');
        }

        return {
            kpoCardNumber,
            wasteCode,
            transportDateTime,
            collectionDate
        };
    }

    async function fetchWasteRecordCardByWasteCode(keoYear, wasteCode) {
        const response = await fetch('/api/records/list-cards', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                year: String(keoYear),
                pageSize: 100
            })
        });

        if (!response.ok) {
            throw new Error(`Błąd GetCards: HTTP ${response.status}`);
        }

        const json = await response.json();
        const items = Array.isArray(json.items) ? json.items : [];
        const targetCode = normalizeWasteCode(wasteCode);

        const match = items.find(item =>
            normalizeWasteCode(item.wasteCode) === targetCode
        );

        if (!match || !match.wasteRecordCardId) {
            throw new Error(`Nie znaleziono record dla kodu odpadu ${targetCode} w roku ${keoYear}`);
        }

        if (match.cardNumber && !String(match.cardNumber).includes(`/${keoYear}/record/`)) {
            throw new Error(`Znaleziono record spoza roku ${keoYear}. Przerwano.`);
        }

        return {
            wasteRecordCardId: String(match.wasteRecordCardId).trim(),
            wasteCodeName: normalizeWasteCode(match.wasteCode),
            keoCardNumber: String(match.cardNumber || '').trim()
        };
    }

    async function fetchKpoIdFromReceiver(kpoYear, wasteCodeName, kpoCardNumber) {
        const normalizedTarget = normalizeCardNumber(kpoCardNumber);
        let pageNumber = 1;
        let totalPages = 1;

        do {
            const response = await fetch('/api/cards/receiver-search', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    year: String(kpoYear),
                    pageSize: 100,
                    pageNumber,
                    wasteCodeName: normalizeWasteCode(wasteCodeName),
                    usedOnly: false
                })
            });

            if (!response.ok) {
                throw new Error(`Błąd Receiver: HTTP ${response.status}`);
            }

            const json = await response.json();
            const items = Array.isArray(json.items) ? json.items : [];
            totalPages = Number(json.totalPages) || 1;

            const found = items.find(item =>
                normalizeCardNumber(item.cardNumber) === normalizedTarget
            );

            if (found && found.kpoId) {
                return String(found.kpoId).trim();
            }

            pageNumber += 1;
        } while (pageNumber <= totalPages);

        throw new Error(`Nie znaleziono kpoId dla numeru ${kpoCardNumber} w roku ${kpoYear}`);
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
            throw new Error(`CreateCollected: ${message}`);
        }

        return json;
    }

    async function autoCreateCollectedAfterAcceptance(row, table, wasteMassValue) {
        const rowData = getRowTransferData(row, table);

        const kpoYear = getKpoYearFromCardNumber(rowData.kpoCardNumber);
        const keoYear = getKeoYear();
        const collectedWasteMass = parsePolishNumber(wasteMassValue);

        if (!kpoYear) {
            throw new Error(`Nie udało się odczytać roku z numeru card: ${rowData.kpoCardNumber}`);
        }

        if (!keoYear) {
            throw new Error('Nie udało się ustalić roku record.');
        }

        if (collectedWasteMass == null) {
            throw new Error('Nie udało się odczytać masy jako liczby.');
        }

        const keo = await fetchWasteRecordCardByWasteCode(keoYear, rowData.wasteCode);
        const kpoCardId = await fetchKpoIdFromReceiver(kpoYear, keo.wasteCodeName, rowData.kpoCardNumber);

        const payload = {
            wasteRecordCardId: keo.wasteRecordCardId,
            wasteCodeName: normalizeWasteCode(keo.wasteCodeName),
            collectionWay: 'BASED_ON_card_CARD',
            kpoCardId,
            kpoCardNumber: rowData.kpoCardNumber,
            collectionDate: rowData.collectionDate,
            collectedWasteMass,
            _fetching: Date.now(),
            _fetching_error: false
        };

        log('record year:', keoYear);
        log('card year:', kpoYear);
        log('CreateCollected payload:', payload);

        await postCreateCollected(payload);
    }

    async function confirmAcceptance(editLink, acceptBtn, row, table) {
        try {
            acceptBtn.disabled = true;
            acceptBtn.textContent = 'Trwa potwierdzanie...';

            const resp = await fetch(editLink.href, { credentials: 'include' });
            if (!resp.ok) throw new Error('Błąd pobierania karty');

            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const tokenInput = doc.querySelector('input[name="__RequestVerificationToken"]');
            if (!tokenInput) throw new Error('Nie znaleziono tokena weryfikacyjnego');
            const token = tokenInput.value;

            const massInput = doc.querySelector('#WasteMass');
            if (!massInput) throw new Error('Nie znaleziono masy w karcie');
            const wasteMass = massInput.value.trim();

            const cardId = editLink.href.split('/').pop();

            const body = new URLSearchParams({
                WasteTransferCardId: cardId,
                CorrectedWasteMass: wasteMass,
                OldWasteMass: wasteMass,
                Remarks: '',
                __RequestVerificationToken: token
            });

            const postResp = await fetch(
                'https://example.registry.local/api/acquired-cards/confirm-receive',
                {
                    method: 'POST',
                    body,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    credentials: 'include'
                }
            );

            if (!postResp.ok) throw new Error('Błąd podczas potwierdzania: ' + postResp.status);

            acceptBtn.textContent = 'Potwierdzono, zapis record...';
            acceptBtn.classList.remove('btn-primary', 'btn-success', 'btn-danger');
            acceptBtn.classList.add('btn-warning');

            await sleep(1000);
            await autoCreateCollectedAfterAcceptance(row, table, wasteMass);

            acceptBtn.textContent = 'Potwierdzono + record ✓';
            acceptBtn.classList.remove('btn-warning', 'btn-primary', 'btn-danger');
            acceptBtn.classList.add('btn-success');
            acceptBtn.disabled = true;

        } catch (err) {
            alert('Błąd podczas potwierdzania / zapisu record:\n' + err.message);
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'Akceptuj';
            acceptBtn.classList.remove('btn-warning', 'btn-success');
            acceptBtn.classList.add('btn-primary');
            console.error('[Registry] confirmAcceptance / autoCreateCollected error:', err);
        }
    }

    async function rejectCard(editLink, rejectBtn, reasonInput) {
        try {
            const reason = reasonInput.value.trim();
            if (!reason) return;

            rejectBtn.disabled = true;
            rejectBtn.textContent = 'Odrzucanie...';

            const resp = await fetch(editLink.href, { credentials: 'include' });
            if (!resp.ok) throw new Error('Błąd pobierania karty');

            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const tokenInput = doc.querySelector('input[name="__RequestVerificationToken"]');
            if (!tokenInput) throw new Error('Nie znaleziono tokena weryfikacyjnego');
            const token = tokenInput.value;

            const cardId = editLink.href.split('/').pop();

            const body = new URLSearchParams({
                WasteTransferCardId: cardId,
                Remarks: reason,
                __RequestVerificationToken: token
            });

            const postResp = await fetch(
                'https://example.registry.local/api/acquired-cards/reject',
                {
                    method: 'POST',
                    body,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    credentials: 'include'
                }
            );

            if (!postResp.ok) throw new Error('Błąd podczas odrzucania: ' + postResp.status);

            rejectBtn.textContent = 'Odrzucono ✗';
            rejectBtn.classList.replace('btn-danger', 'btn-secondary');
            rejectBtn.disabled = true;
            reasonInput.disabled = true;

        } catch (err) {
            alert('Błąd podczas odrzucania:\n' + err.message);
            rejectBtn.textContent = 'Odrzuć';
            rejectBtn.disabled = false;
        }
    }

    function enhanceTable(table) {
        if (table.dataset.enhanced) return;
        table.dataset.enhanced = 'true';

        removeColumns(table);

        const headerRow = table.querySelector('thead tr');
        if (headerRow) {
            const emptyTh = document.createElement('th');
            headerRow.prepend(emptyTh);
        }

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const editLink = row.querySelector("a[title='Zmiana statusu']");
            if (!editLink) return;

            const massCell = document.createElement('td');
            massCell.style.whiteSpace = 'normal';
            massCell.style.verticalAlign = 'top';

            const massBtn = document.createElement('button');
            massBtn.textContent = 'Pobierz dane';
            massBtn.className = 'btn btn-sm btn-info registry-mass-btn';
            massBtn.style.display = 'block';
            massBtn.style.width = '180px';
            massBtn.style.marginBottom = '4px';

            const massDisplay = document.createElement('div');
            massDisplay.style.fontWeight = 'bold';
            massDisplay.style.fontSize = '0.9em';
            massDisplay.style.whiteSpace = 'normal';
            massDisplay.style.marginBottom = '8px';

            const reasonInput = document.createElement('input');
            reasonInput.type = 'text';
            reasonInput.placeholder = 'Powód odrzucenia';
            reasonInput.className = 'form-control form-control-sm';
            reasonInput.style.width = '180px';
            reasonInput.style.marginBottom = '4px';

            const rejectBtn = document.createElement('button');
            rejectBtn.textContent = 'Odrzuć';
            rejectBtn.className = 'btn btn-sm btn-danger registry-reject-btn';
            rejectBtn.style.display = 'block';
            rejectBtn.style.width = '180px';
            rejectBtn.disabled = true;

            reasonInput.addEventListener('input', () => {
                rejectBtn.disabled = reasonInput.value.trim().length === 0;
            });

            rejectBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await rejectCard(editLink, rejectBtn, reasonInput);
            });

            massCell.appendChild(massBtn);
            massCell.appendChild(massDisplay);
            massCell.appendChild(reasonInput);
            massCell.appendChild(rejectBtn);
            row.prepend(massCell);

            massBtn.addEventListener('click', async () => {
                massBtn.disabled = true;
                massBtn.textContent = 'Ładowanie...';

                const { mass, address, carrierName } = await fetchMassAndAddressFromCard(editLink.href);

                massDisplay.textContent = `${mass} t`;

                let nextRow = row.nextElementSibling;
                while (nextRow && (
                    nextRow.classList.contains('address-row') ||
                    nextRow.classList.contains('carrier-row') ||
                    nextRow.classList.contains('spacer-row')
                )) {
                    const toRemove = nextRow;
                    nextRow = nextRow.nextElementSibling;
                    toRemove.remove();
                }

                const addressRow = document.createElement('tr');
                addressRow.classList.add('address-row');
                const addressCell = document.createElement('td');
                addressCell.colSpan = row.children.length;
                addressCell.style.fontStyle = 'italic';
                addressCell.style.backgroundColor = '#f2f2f2';
                addressCell.style.padding = '8px';
                const addressLabel = document.createElement('strong');
                addressLabel.textContent = 'Business location address: ';
                addressCell.appendChild(addressLabel);
                addressCell.appendChild(document.createTextNode(address));
                addressRow.appendChild(addressCell);

                const carrierRow = document.createElement('tr');
                carrierRow.classList.add('carrier-row');
                const carrierCell = document.createElement('td');
                carrierCell.colSpan = row.children.length;
                carrierCell.style.fontStyle = 'italic';
                carrierCell.style.backgroundColor = '#e6f7ff';
                carrierCell.style.padding = '8px';
                const carrierLabel = document.createElement('strong');
                carrierLabel.textContent = 'Carrier name: ';
                carrierCell.appendChild(carrierLabel);
                carrierCell.appendChild(document.createTextNode(carrierName));
                carrierRow.appendChild(carrierCell);

                row.parentNode.insertBefore(carrierRow, row.nextSibling);
                row.parentNode.insertBefore(addressRow, carrierRow.nextSibling);

                massBtn.textContent = 'Pobierz dane';
                massBtn.disabled = false;
            });

            const btnGroup = row.querySelector('.btn-group');
            if (btnGroup) {
                const spacer = document.createElement('div');
                spacer.style.height = '95px';
                btnGroup.appendChild(spacer);

                const acceptBtn = document.createElement('button');
                acceptBtn.textContent = 'Akceptuj';
                acceptBtn.className = 'btn btn-sm btn-primary registry-accept-btn';
                acceptBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await confirmAcceptance(editLink, acceptBtn, row, table);
                });
                btnGroup.appendChild(acceptBtn);
            }
        });
    }

    const observer = new MutationObserver(() => {
        const table = document.querySelector('#table-generated-cards');
        if (table) enhanceTable(table);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();