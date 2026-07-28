# Response Match Tooltip

Chrome Manifest V3 extension that opens as a toolbar popup/tooltip by default, can also be opened from the extension icon context menu as a browser side panel, and watches outgoing JSON request payloads for a configured request path.

## Features

- Filters outgoing network requests by a URL/path fragment.
- Supports accordion scenarios; each scenario contains its own comparison rules with:
  - key path, for example `extra_data.visual_object.id`;
  - strict or non-strict comparison;
  - expected value list split by commas;
  - optional **100% required** flag: required rules must match for the scenario to be recorded, while non-required rules are reported as matched, missing, or mismatched.
- Shows current search results and records matched outgoing requests in the History tab.
- Opens as a popup on regular extension icon click; right-click the icon and choose whether future clicks should open **Открывать как попап** or **Открывать как сайдпанель**.
- Provides buttons to clear current search results and delete history.
- Can warn with an alert when the active page navigates to a different host.

## Load locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Click the extension icon to open the popup tooltip.
6. To remember how the UI should open next time, right-click the extension icon and choose **Открывать как попап** or **Открывать как сайдпанель**.

> To inspect requests in Incognito, enable **Allow in Incognito** for the extension in `chrome://extensions`. Chrome keeps split Incognito storage separate from regular browsing storage.
