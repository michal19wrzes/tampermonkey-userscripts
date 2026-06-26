# Port Szczecin - XLSX Export

Tampermonkey userscript that adds a floating export panel to a public port dispatch page. The script parses the visible document, lets the user select one or more ports, and exports structured data to an Excel workbook.

## Screenshot

![Port Szczecin userscript panel](../assets/port-szczecin-panel.png)

## What it does

The original page presents a daily port operations document in a text-heavy layout. This userscript adds a browser-side export workflow on top of that page:

1. detects available port sections,
2. displays them as checkboxes in a floating panel,
3. parses schedule rows from the visible document,
4. extracts cargo, quantity, relation, shift, and notes fields,
5. optionally extracts water level data,
6. generates an XLSX workbook directly in the browser.

## Features

- Floating port selection panel
- Select all / deselect all controls
- XLSX export directly from the browser
- Automatic parsing of daily port schedule rows
- Separate worksheet for water level data when available
- Column auto-sizing in the generated workbook
- Self-contained Tampermonkey userscript with no build step

## Generated workbook

The export creates an Excel file with structured columns such as:

- port,
- quay,
- agent,
- ship,
- cargo,
- quantity,
- relation,
- forwarder,
- shift markers,
- notes.

When water level information is detected, the script also adds a separate `Stan_wody` worksheet.

## Installation

1. Install Tampermonkey in your browser.
2. Open `port-szczecin-export-xlsx.user.js`.
3. Copy the content into a new Tampermonkey script.
4. Save and enable the script.
5. Open the supported dispatch page.
6. Use the `Eksport XLSX` panel.

## Technical notes

- The script uses the `xlsx` browser library through the userscript metadata `@require` directive.
- The parser is designed for fixed-width, text-like document layouts.
- The UI is injected only once and runs entirely in the browser.
- No credentials, tokens, or backend requests are stored by the script.

## Privacy notes

The screenshot in this README is anonymized and is intended only to demonstrate the browser-side UI enhancement. Operational details, names, dates, and sensitive document content should not be included in public screenshots.
