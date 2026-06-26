// ==UserScript==
// @name         Registry Transport Cards Assistant v1.7.4
// @namespace    registry-workflow-sanitized
// @version      1.7.4
// @description  Adds quick data preview and background confirmation actions to transport-card tables.
// @match        https://example.registry.local/app/transport-cards/receive-confirmed*
// @grant        none
// @author       Michal Nogal
// ==/UserScript==

// Public portfolio version: system name and production domain are anonymized.
// Replace @match domains and endpoint paths only in environments where you are authorized to automate the workflow.

(function () {
    'use strict';

    async function fetchMassAndAddressFromCard(url) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error('Nie udało się pobrać karty');

            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            const massElem = doc.querySelector('#WasteMass');

            // Adres po etykiecie
            let address = 'Brak adresu';
            const label = doc.querySelector('label[for="SenderEupAddress"]');
            if (label) {
                const addressDiv = label.closest('.form-group')
                    ?.querySelector('.form-control.first-form_control--data.white-readonly.textarea');
                if (addressDiv) {
                    address = addressDiv.innerText.trim();
                }
            }

            // Osoba potwierdzająca przyjęcie
            const userElem = doc.querySelector('#ReceiveConfirmationUser');
            const confirmedBy = userElem ? userElem.value.trim() : 'Brak danych';

            const mass = massElem ? massElem.value.trim() : 'Brak masy';

            return { mass, address, confirmedBy };
        } catch (err) {
            console.error(err);
            return { mass: 'Błąd', address: 'Błąd', confirmedBy: 'Błąd' };
        }
    }

    async function acceptTransportCard(url, button) {
        try {
            button.disabled = true;
            button.textContent = 'Przetwarzanie...';

            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error('Błąd otwierania karty');

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const form = doc.querySelector('#WasteTransferTransportCardForm');

            if (!form) throw new Error('Nie znaleziono formularza');

            const formData = new FormData(form);
            const actionUrl = form.action;

            const submitResp = await fetch(actionUrl, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (submitResp.ok) {
                button.textContent = 'Potwierdzono ✅';
                button.classList.remove('btn-primary');
                button.classList.add('btn-success');
            } else {
                button.textContent = 'Błąd ❌';
                button.classList.remove('btn-primary');
                button.classList.add('btn-danger');
            }
        } catch (err) {
            console.error(err);
            button.textContent = 'Błąd ❌';
            button.classList.remove('btn-primary');
            button.classList.add('btn-danger');
        } finally {
            button.disabled = false;
        }
    }

    function removeColumns(table) {
        const headerCells = table.querySelectorAll('thead th');
        let kodExIndex = -1;
        let utrataStatusuIndex = -1;

        headerCells.forEach((th, idx) => {
            const text = th.textContent.trim();
            if (text === 'Kod ex') kodExIndex = idx;
            if (text.includes('Utrata statusu kodu niebezpiecznego')) utrataStatusuIndex = idx;
        });

        if (utrataStatusuIndex === -1) {
            headerCells.forEach((th, idx) => {
                const text = th.textContent.trim();
                if (text.includes('Utrata statusu')) utrataStatusuIndex = idx;
            });
        }

        [kodExIndex, utrataStatusuIndex].sort((a, b) => b - a).forEach(idx => {
            if (idx !== -1) {
                headerCells[idx].remove();
            }
        });

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            [kodExIndex, utrataStatusuIndex].sort((a, b) => b - a).forEach(idx => {
                if (idx !== -1 && cells[idx]) {
                    cells[idx].remove();
                }
            });
        });
    }

    window.addEventListener('load', () => {
        setTimeout(() => {
            const table = document.querySelector('#table-receive-confirmed-cards');
            if (!table) return;

            removeColumns(table);

            const headerRow = table.querySelector('thead tr');
            if (headerRow) {
                const emptyTh = document.createElement('th');
                emptyTh.textContent = '';
                headerRow.prepend(emptyTh);
            }

            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const editLink = row.querySelector("a[title='Edycja/Zmiana statusu']");
                if (!editLink) return;
                const editHref = editLink.href;

                const massCell = document.createElement('td');
                massCell.style.whiteSpace = 'normal';
                massCell.style.verticalAlign = 'top';

                const massBtn = document.createElement('button');
                // 🔹 Zmieniona etykieta przycisku
                massBtn.textContent = 'Pobierz dane';
                massBtn.className = 'btn btn-sm btn-info';
                massBtn.style.display = 'block';
                massBtn.style.marginBottom = '4px';

                const massDisplay = document.createElement('div');
                massDisplay.style.fontWeight = 'bold';
                massDisplay.style.fontSize = '0.9em';
                massDisplay.style.whiteSpace = 'normal';

                massCell.appendChild(massBtn);
                massCell.appendChild(massDisplay);
                row.prepend(massCell);

                massBtn.addEventListener('click', async () => {
                    massBtn.disabled = true;
                    massBtn.textContent = 'Ładowanie...';

                    const { mass, address, confirmedBy } = await fetchMassAndAddressFromCard(editHref);

                    massDisplay.textContent = `${mass} t`;

                    const nextRow = row.nextElementSibling;
                    if (nextRow && nextRow.classList.contains('address-row')) {
                        nextRow.remove();
                    }

                    const addressRow = document.createElement('tr');
                    addressRow.classList.add('address-row');

                    const addressCell = document.createElement('td');
                    addressCell.colSpan = row.children.length;
                    addressCell.style.fontStyle = 'italic';
                    addressCell.style.backgroundColor = '#f2f2f2';
                    addressCell.style.padding = '8px';
                    addressCell.appendChild(document.createTextNode(`Address: ${address}`));
                    addressCell.appendChild(document.createElement('br'));
                    addressCell.appendChild(document.createTextNode('Confirmed by: '));
                    const confirmedByStrong = document.createElement('strong');
                    confirmedByStrong.textContent = confirmedBy;
                    addressCell.appendChild(confirmedByStrong);

                    addressRow.appendChild(addressCell);
                    row.parentNode.insertBefore(addressRow, row.nextSibling);

                    // Po pobraniu danych wracamy do nazwy przycisku
                    massBtn.textContent = 'Pobierz dane';
                    massBtn.disabled = false;
                });

                const btnGroup = row.querySelector('.btn-group');
                if (btnGroup) {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.textContent = 'Akceptuj';
                    acceptBtn.className = 'btn btn-sm btn-primary';
                    acceptBtn.style.marginLeft = '10px';

                    acceptBtn.addEventListener('click', () => {
                        acceptTransportCard(editHref, acceptBtn);
                    });

                    btnGroup.appendChild(acceptBtn);
                }
            });
        }, 1000);
    });
})();
