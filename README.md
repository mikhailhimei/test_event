# Response Match Side Panel

Chrome Manifest V3 extension that opens as a browser side panel and watches JSON responses for a configured request path.

## Features

- Filters network responses by a URL/path fragment.
- Supports multiple comparison blocks with:
  - key path, for example `extra_data.visual_object.id`;
  - strict or non-strict comparison;
  - expected value list split by commas.
- Shows current search results and records matched responses in the History tab.
- Provides buttons to clear current search results and delete history.
- Can warn with an alert when the active page navigates to a different host.

## Load locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Click the extension icon to open the side panel.

> Network response inspection uses the Chrome Debugger API, so Chrome will show a debugger permission warning while the panel is attached to the active tab.
