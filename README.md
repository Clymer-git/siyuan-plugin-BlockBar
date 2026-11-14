# BlockBar·Bolt

A SiYuan plugin that docks a customizable quick toolbar right above the mobile keyboard toolbar, so the actions you use most while editing are one tap away without leaving the keyboard.

## Features

- Quick toolbar with 9 default panels (heading / list / insert / quote / table / block / style / math / diagram), fully customizable.
- Buttons and panels can be added, removed, renamed, re-iconed, reordered (drag the handle) and disabled one by one.
- Keyboard-friendly: toolbar actions do not steal the soft keyboard; it only closes when a native menu or a dialog needs the space.
- Dynamic capability discovery: icon list and menu entries are read from the running SiYuan, so new icons and menu items usually appear without a plugin update.
- Diagnostics page in settings: shows whether each action is dynamically discovered, fallback or unavailable.

## Requirements

- SiYuan **3.8.4 or newer**.
- Mobile app (Android / iOS / HarmonyOS) or mobile browser.

> Since v0.8.68 the dedicated table toolbar has been removed: SiYuan 3.8.8 already ships a much stronger native table experience, so duplicating it inside the plugin only added maintenance cost. Caret-keeping inside table cells is still handled by the plugin's keyboard guard.

## Install

1. Download `package.zip`.
2. Open SiYuan → Settings → Marketplace → Downloaded → Install from package (choose the zip).
3. Enable the plugin.
4. Open a document and tap a paragraph to bring up the keyboard.

## Notes

- This plugin keeps its own settings under its own plugin directory and never touches other plugins' data.
- Configuration from older versions that contained table-toolbar entries is imported safely: those entries are dropped on load, and the field disappears the next time you save.

## License

MIT
