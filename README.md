# Tampermonkey Userscripts

A curated collection of self-contained Tampermonkey userscripts for enhancing existing web applications, automating repetitive browser workflows, and improving day-to-day productivity.

Each script is designed to stay plug-and-play: install it directly in Tampermonkey as a single `.user.js` file, without a build step.

## Repository structure

```text
tampermonkey-userscripts/
  port-szczecin/
    port-szczecin-export-xlsx.user.js
  registry-workflow-sanitized/
    registry-acquired-cards-assistant-auto-record.user.js
    registry-auto-treatment-entry.user.js
    registry-record-accept-from-card-search.user.js
    registry-record-extra-info.user.js
    registry-transport-cards-assistant.user.js
```

## Scripts

### Port Szczecin

Browser-side export helper for a port dispatch web page. It parses tabular page content, allows selecting ports, and exports structured data to XLSX.

### Registry workflow sanitized

Anonymized workflow automation examples for a registry-style web application. These scripts demonstrate:

- DOM augmentation for existing web tables
- Row-level action buttons
- Fetch-based integration with backend endpoints
- Request payload reconstruction
- Input normalization and validation
- MutationObserver-based handling of dynamic pages
- Controlled browser-side workflow automation

The registry scripts are sanitized portfolio examples. Production system names, domains, and endpoint paths have been replaced with placeholders.

## Installation

1. Install Tampermonkey in your browser.
2. Open a `.user.js` file from this repository.
3. Copy the file content into a new Tampermonkey script.
4. Adjust `@match` and endpoint placeholders only for environments where you are authorized to use the automation.
5. Save and enable the script.

## Safety and usage notes

These scripts modify the browser-side UI of existing web applications and, in some cases, send authenticated requests using the current browser session.

Before using similar scripts in a real environment:

- verify that automation is allowed by the application owner and applicable terms of service,
- test on non-production or low-risk data first,
- keep debug logging disabled when processing business data,
- avoid storing credentials or tokens in the script,
- review every endpoint and request payload before enabling write actions,
- treat scripts that create, accept, reject, or modify records as high-impact automation.

## Development principles

- One file per userscript for Tampermonkey compatibility.
- No build step required.
- Clear separation through functions rather than modules.
- Defensive DOM querying.
- Explicit validation before write actions.
- Minimal global state.
- Sanitized public examples for sensitive workflows.

## Disclaimer

This repository contains unofficial browser-side enhancements. The scripts are provided for educational, portfolio, and controlled internal-use scenarios. Use them only where you have permission to automate the target workflow.
