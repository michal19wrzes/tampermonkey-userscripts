# Port Szczecin - XLSX Export

Tampermonkey userscript that adds a floating export panel to a port dispatch web page. The script parses the visible document, lets the user select one or more ports, and exports structured data to an Excel workbook.

## Screenshot

![Port Szczecin userscript panel](../assets/port-szczecin-panel.png)

## Features

- Floating port selection panel
- Select all / deselect all controls
- XLSX export directly from the browser
- Automatic parsing of daily port schedule rows
- Separate worksheet for water level data when available
- Self-contained Tampermonkey userscript with no build step

## Installation

1. Install Tampermonkey in your browser.
2. Open `port-szczecin-export-xlsx.user.js`.
3. Copy the content into a new Tampermonkey script.
4. Save and enable the script.
5. Open the supported dispatch page and use the `Eksport XLSX` panel.

## Notes

The screenshot is anonymized and intended only to demonstrate the browser-side UI enhancement.
