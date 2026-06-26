// ==UserScript==
// @name         Registry AUTO Treatment Entry
// @namespace    registry-workflow-sanitized
// @version      0.3
// @description  Automatically creates a treatment/recycling entry after saving a collected-waste entry in a registry workflow.
// @match        https://example.registry.local/app/records/create-collected*
// @match        https://example.registry.local/app/records/create-collected/*
// @grant        none
// @author       Michal Nogal
// ==/UserScript==

// Public portfolio version: system name and production domain are anonymized.
// Replace @match domains and endpoint paths only in environments where you are authorized to automate the workflow.

(function () {
    'use strict';

    const DEBUG = false;

    const DEFAULTS = {
        processType: 'R',
        wasteProcessId: '3801',
        wasteManagementType: 'RECYCLING',
        installationName: 'Instalacja recyklingowa',
        lossOfWasteStatus: 'true',
        type: 'zrębka drzewna'
    };

    function log(...args) {
        if (DEBUG) {
            console.log('[Registry AUTO TREATED]', ...args);
        }
    }

    function parsePlNumber(value) {
        if (value == null) return null;

        const text = String(value)
            .replace(/\s/g, '')
            .replace('%', '')
            .replace(',', '.')
            .trim();

        const num = Number(text);

        return Number.isFinite(num) ? num : null;
    }

    // KLASYCZNE ZAOKRĄGLENIE
    function format4(num) {

        return (
            Math.ceil(Number(num) * 10000) / 10000
        ).toFixed(4);
    }

    function isValidDatePL(value) {
        return /^\d{2}-\d{2}-\d{4}$/.test(String(value || '').trim());
    }

    function getWasteRecordCardId() {
        const match = window.location.pathname.match(
            /CollectedWaste\/([0-9a-f-]{36})/i
        );

        return match ? match[1] : null;
    }

    function getMassInput() {
        return document.querySelector('#collectedWasteMass');
    }

    function calculateReducedMass() {

        const massInput = getMassInput();
        const percentInput = document.querySelector('#registry-treated-percent');

        const mass = parsePlNumber(massInput?.value);
        const percent = parsePlNumber(percentInput?.value);

        if (mass == null || percent == null) {
            return null;
        }

        return mass * (1 - percent / 100);
    }

    function updatePreview() {

        const preview = document.querySelector('#registry-treated-preview');

        if (!preview) return;

        const result = calculateReducedMass();

        preview.value = result == null
            ? ''
            : format4(result);
    }

    function setupDateMask() {

        const input = document.querySelector('#registry-treated-date');

        if (!input) return;

        // tylko cyfry
        input.addEventListener('keypress', (e) => {

            if (!/[0-9]/.test(e.key)) {
                e.preventDefault();
            }
        });

        // automatyczne myślniki
        input.addEventListener('input', () => {

            let value = input.value.replace(/\D/g, '');

            value = value.substring(0, 8);

            if (value.length > 4) {

                value = value.replace(
                    /(\d{2})(\d{2})(\d{1,4})/,
                    '$1-$2-$3'
                );

            } else if (value.length > 2) {

                value = value.replace(
                    /(\d{2})(\d{1,2})/,
                    '$1-$2'
                );
            }

            input.value = value;
        });
    }

    function injectFields() {

        if (document.querySelector('#registry-treated-fields')) {
            return;
        }

        const textarea = document.querySelector('#additionalInformations');

        if (!textarea) {
            return;
        }

        const wrapper = document.createElement('div');

        wrapper.id = 'registry-treated-fields';
        wrapper.className = 'row';
        wrapper.style.marginTop = '12px';

        wrapper.innerHTML = `
            <div class="form-group col-lg-4">
                <div class="form-group-row">
                    <label class="control-label">
                        Data przetworzenia / recyklingu
                    </label>
                    <span class="required"> *</span>
                </div>

                <input
                    type="text"
                    class="form-control"
                    id="registry-treated-date"
                    placeholder="dd-mm-rrrr"
                    maxlength="10"
                    inputmode="numeric"
                >
            </div>

            <div class="form-group col-lg-4">
                <div class="form-group-row">
                    <label class="control-label">
                        Pomniejszenie [%]
                    </label>
                    <span class="required"> *</span>
                </div>

                <input
                    type="text"
                    class="form-control"
                    id="registry-treated-percent"
                    placeholder="2,1%"
                >
            </div>

            <div class="form-group col-lg-4">
                <div class="form-group-row">
                    <label class="control-label">
                        Masa po pomniejszeniu [Mg]
                    </label>
                </div>

                <input
                    type="text"
                    class="form-control"
                    id="registry-treated-preview"
                    readonly
                >
            </div>
        `;

        textarea.closest('.form-group').after(wrapper);

        setupDateMask();

        const percentInput = document.querySelector('#registry-treated-percent');

        percentInput.addEventListener('input', updatePreview);

        const massInput = getMassInput();

        if (massInput) {

            massInput.addEventListener('input', updatePreview);
            massInput.addEventListener('change', updatePreview);
        }

        updatePreview();

        log('Dodano pola formularza.');
    }

    function buildCreateTreatedPayload() {

        const wasteRecordCardId = getWasteRecordCardId();

        const wasteRecycleTime = document
            .querySelector('#registry-treated-date')
            ?.value
            .trim();

        const treatedWasteMassRaw = parsePlNumber(
            getMassInput()?.value
        );

        const massInTonnesRaw = calculateReducedMass();

        if (!wasteRecordCardId) {
            throw new Error('Nie znaleziono wasteRecordCardId.');
        }

        if (!isValidDatePL(wasteRecycleTime)) {
            throw new Error(
                'Data musi mieć format dd-mm-rrrr.'
            );
        }

        if (treatedWasteMassRaw == null) {
            throw new Error(
                'Nie udało się odczytać masy odpadu.'
            );
        }

        if (massInTonnesRaw == null) {
            throw new Error(
                'Nie udało się wyliczyć masy po pomniejszeniu.'
            );
        }

        return {

            wasteRecordCardId,

            wasteRecycleTime,

            treatedWasteMass: format4(
                treatedWasteMassRaw
            ),

            processType:
                DEFAULTS.processType,

            wasteProcessId:
                DEFAULTS.wasteProcessId,

            wasteManagementType:
                DEFAULTS.wasteManagementType,

            installationName:
                DEFAULTS.installationName,

            lossOfWasteStatus:
                DEFAULTS.lossOfWasteStatus,

            massInTonnes: format4(
                massInTonnesRaw
            ),

            type:
                DEFAULTS.type,

            _fetching: Date.now(),

            _fetching_error: false
        };
    }

    async function postCreateTreated(payload) {

        log('CreateTreated payload:', payload);

        const response = await fetch(
            '/api/records/create-treated',
            {
                method: 'POST',

                credentials: 'include',

                headers: {
                    accept: '*/*',
                    'content-type':
                        'application/json; charset=utf-8'
                },

                body: JSON.stringify(payload)
            }
        );

        let json = null;

        try {
            json = await response.clone().json();
        } catch (_) {}

        if (!response.ok) {

            throw new Error(
                'CreateTreated HTTP ' +
                response.status +
                (
                    json
                        ? ' : ' + JSON.stringify(json)
                        : ''
                )
            );
        }

        log('CreateTreated OK:', json);

        return json;
    }

    function patchFetch() {

        // This hook reacts to the host application's successful create-record request.
        // It is intentionally scoped to a single endpoint substring and guarded against double patching.
        // Review this section carefully before enabling the script in any real environment.
        if (window.__registryCreateTreatedPatched) {
            return;
        }

        window.__registryCreateTreatedPatched = true;

        const originalFetch = window.fetch;

        window.fetch = async function (...args) {

            const response =
                await originalFetch.apply(this, args);

            try {

                const url = String(args[0] || '');

                // po CreateCollected
                if (
                    url.includes(
                        '/api/records/create-collected'
                    )
                ) {

                    const cloned = response.clone();

                    if (cloned.ok) {

                        setTimeout(async () => {

                            try {

                                const payload =
                                    buildCreateTreatedPayload();

                                await postCreateTreated(
                                    payload
                                );

                                log(
                                    'Dodano wpis CreateTreated.'
                                );

                            } catch (err) {

                                alert(
                                    'Przyjęcie zapisane, ale nie udało się utworzyć wpisu przetwarzania:\n\n' +
                                    err.message
                                );

                                console.error(err);
                            }

                        }, 300);
                    }
                }

            } catch (err) {

                console.error(
                    '[Registry AUTO TREATED] patchFetch error:',
                    err
                );
            }

            return response;
        };
    }

    function validateBeforeSave() {

        document.addEventListener(
            'click',
            function (e) {

                const saveBtn = e.target.closest(
                    'a.btn.btn-success[title="Zapisz"]'
                );

                if (!saveBtn) {
                    return;
                }

                try {

                    buildCreateTreatedPayload();

                } catch (err) {

                    e.preventDefault();
                    e.stopPropagation();

                    alert(err.message);
                }

            },
            true
        );
    }

    const observer = new MutationObserver(() => {
        injectFields();
    });

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

    injectFields();

    patchFetch();

    validateBeforeSave();

})();
