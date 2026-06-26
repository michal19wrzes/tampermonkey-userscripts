# Registry Workflow - Sanitized Tampermonkey Userscripts

This directory contains sanitized Tampermonkey userscripts for an environmental registry-style workflow. The scripts are based on practical browser-side automation patterns: extending existing tables, adding contextual actions, retrieving related record data, validating form input, and automating repetitive workflow steps.

The public version is intentionally pseudonymized. It preserves the domain context of waste records, transfer cards, transport confirmations, and treatment entries, but removes direct production domains, system names, real identifiers, and sensitive operational data.

No screenshots are included for this section because the original user interface is distinctive. The README focuses on what the userscripts do and how they are structured rather than exposing the target system visually.

## Directory contents

```text
registry-workflow-sanitized/
  registry-acquired-cards-assistant-auto-record.user.js
  registry-auto-treatment-entry.user.js
  registry-record-accept-from-card-search.user.js
  registry-record-extra-info.user.js
  registry-transport-cards-assistant.user.js
```

## Script overview

### 1. `registry-acquired-cards-assistant-auto-record.user.js`

Adds a workflow assistant to acquired transfer-card tables.

It enhances the original table with additional controls that allow the user to retrieve related card data, display the mass and contextual information, reject a card with a reason, accept a card, and optionally create a related registry record after acceptance.

Main capabilities:

- adds a left-side action column to existing rows,
- fetches additional data from the card details page,
- displays mass, business address, and carrier name directly in the list view,
- adds a rejection input and rejection action,
- adds an acceptance action to the original button group,
- retrieves verification tokens from the original form before status changes,
- reconstructs the payload required to create a related registry record,
- validates card number, waste code, date, mass, and record year before write actions,
- uses clear button states during long-running operations.

Important implementation details:

- the script reads visible table data and related detail pages,
- write actions are only triggered by explicit user clicks,
- the auto-record step is executed after successful acceptance,
- endpoint paths and domains are placeholders in the public version.

Best demonstrated skills:

- DOM augmentation of an existing enterprise-style table,
- safe workflow sequencing across multiple backend requests,
- parsing and normalizing business identifiers,
- authenticated form submission from a userscript,
- defensive error handling around high-impact operations.

---

### 2. `registry-auto-treatment-entry.user.js`

Automatically prepares and creates a treatment/recycling entry after a collected-waste record is saved.

The script injects additional form fields into the existing collected-waste form. The user enters a treatment date and a percentage reduction. The script calculates the resulting mass, validates the input, and creates a related treatment entry after the original collected-waste save request succeeds.

Main capabilities:

- injects additional form fields into an existing form,
- adds a date input mask for `dd-mm-yyyy`,
- calculates reduced mass based on percentage input,
- shows a read-only preview of the calculated value,
- validates date, original mass, and calculated mass before save,
- intercepts the successful collected-record save flow,
- sends a follow-up request to create a treatment entry,
- displays an alert if the original save succeeds but the follow-up entry fails.

Important implementation details:

- this script patches `window.fetch` to observe a specific save request,
- the fetch patch is guarded to avoid double patching,
- the follow-up action is triggered only after a successful original response,
- debug logging is disabled in the public version,
- endpoint paths and default treatment values are sanitized examples.

Best demonstrated skills:

- controlled interception of browser requests,
- form augmentation without changing backend code,
- input masking and validation,
- derived-value calculations,
- workflow continuation after an existing application action.

---

### 3. `registry-record-accept-from-card-search.user.js`

Adds an accept action to a card-search modal and creates a registry entry from the selected row.

The script enhances a modal search table by inserting an action column. For each row, it reads card number, transfer date, and mass, resolves the backend card identifier, builds the create-record payload, and submits the selected item as a collected record.

Main capabilities:

- adds an action button to every eligible search-result row,
- reads table headers dynamically to locate relevant columns,
- normalizes card numbers and Polish decimal formats,
- detects current page number and selected year filters,
- resolves the backend card identifier by querying the search endpoint,
- creates a collected record from the selected card,
- refreshes collected items after a successful create action,
- keeps local pending and accepted state to prevent duplicate clicks.

Important implementation details:

- the script supports paginated modal search results,
- row state is tracked with `Set` collections,
- a `MutationObserver` re-applies enhancements after dynamic table updates,
- button states reflect loading, success, and error cases,
- write actions require an explicit click per row.

Best demonstrated skills:

- enhancing dynamic modal content,
- reconstructing backend payloads from UI data,
- dealing with pagination and filters,
- preventing duplicate submissions,
- maintaining local UI state in a browser extension context.

---

### 4. `registry-record-extra-info.user.js`

Adds a row-level extra-info panel to a collected-record table.

The script inserts a fetch button for each row. When clicked, it retrieves additional information for that row from the backend and displays it as an inline detail row directly below the original table row.

Main capabilities:

- adds a custom header and action cell to an existing table,
- extracts row identifiers from edit links,
- fetches row-specific additional information,
- displays details in a readable inline row,
- caches fetched details to avoid unnecessary duplicate requests,
- tracks pending requests to prevent repeated clicks,
- restores detail rows after DOM refreshes,
- reacts to table and URL changes.

Important implementation details:

- fetched details are stored in a `Map`,
- currently pending row IDs are stored in a `Set`,
- the script uses scheduled enhancement to reduce repeated DOM work,
- all row updates are reversible by removing custom cells and detail rows,
- sorting-related guard logic is preserved as a documented pattern but relaxed in the sanitized version.

Best demonstrated skills:

- table enhancement with cached row-level data,
- dynamic DOM synchronization,
- idempotent UI injection,
- inline detail rendering without navigating away,
- safe request de-duplication.

---

### 5. `registry-transport-cards-assistant.user.js`

Adds quick data preview and background confirmation actions to transport-card tables.

The script augments transport-card rows with a data preview button and an acceptance button. The preview action fetches details from the card page and shows mass, address, and confirmation user information directly in the list view. The acceptance action submits the original card form in the background.

Main capabilities:

- removes low-value columns from the table view,
- adds a custom action column,
- fetches mass, address, and confirmation user from the details page,
- displays the fetched information inline under the selected row,
- adds a background acceptance action,
- submits the original form using `FormData`,
- gives visual feedback for success and error states.

Important implementation details:

- the script waits for page load before enhancing the table,
- it reuses the original form action from the fetched details page,
- it does not store credentials or tokens,
- acceptance is triggered by explicit user interaction,
- the public version uses placeholder match patterns.

Best demonstrated skills:

- background form submission,
- HTML parsing from fetched pages,
- extracting data from readonly form controls,
- simplifying overloaded enterprise tables,
- integrating additional workflow actions into existing UI.

## Shared technical patterns

Across the registry userscripts, the same architectural patterns appear repeatedly:

- **Self-contained scripts** - every file can be installed directly in Tampermonkey.
- **Defensive selectors** - DOM elements are checked before use.
- **Normalization helpers** - card numbers, waste codes, dates, and decimal values are cleaned before comparison or submission.
- **Explicit validation** - high-impact actions validate required data before sending requests.
- **User-facing feedback** - buttons reflect loading, success, and error states.
- **MutationObserver usage** - scripts handle dynamic tables and UI refreshes.
- **Minimal global state** - local `Map` and `Set` collections are used only where needed.
- **No stored credentials** - requests rely on the active browser session.
- **Placeholder endpoints** - public code avoids direct production domain references.

## Safety notes

These scripts represent high-impact workflow automation. Some actions may create, accept, reject, or update records in the target system.

Before adapting similar scripts to a real environment:

- confirm that browser-side automation is allowed,
- use only in systems where you are authorized,
- review every request payload,
- test with non-production or low-risk data,
- keep debug logging disabled,
- avoid exposing personal, business, or operational data,
- document which actions are automated,
- make sure users understand which clicks trigger write operations.

## Why this section has no screenshots

The original registry interface is visually distinctive. Even heavily redacted screenshots could reveal the source system. For that reason, this public documentation describes the behavior and architecture of the userscripts without publishing UI screenshots.

## Adaptation checklist

Before using any sanitized registry userscript in an authorized environment:

1. Replace the placeholder `@match` domain.
2. Replace placeholder endpoint paths.
3. Verify selectors against the target application version.
4. Confirm that request payload shapes still match the backend.
5. Test read-only actions first.
6. Test write actions with safe records.
7. Keep a manual fallback path for every automated workflow.
8. Disable or remove any action that is not explicitly approved.
