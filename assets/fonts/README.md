# Font Files Required

To complete the PoE Trade visual match, you need to add these font files to this directory:

## Required Files:
- `FontinSmallCaps.woff2` - Primary format (smallest file size)
- `FontinSmallCaps.woff` - Fallback format
- `FontinSmallCaps.ttf` - Final fallback format
- `FontinRegular.woff2` - Primary format for body text
- `FontinRegular.woff` - Fallback format for body text
- `FontinRegular.ttf` - Final fallback format for body text

## Font Source:
The FontinSmallCaps and FontinRegular fonts are used by Path of Exile Trade. You can obtain them from:
1. The official PoE Trade website's font files
2. Extract from browser developer tools when visiting pathofexile.com/trade
3. Use the font files from the existing Trade site folder

## Usage:
Once the font files are in place, the extension will use:
- **FontinSmallCaps** for headers and titles (e.g., "SEARCH POE WIKI")
- **FontinRegular** for body text, input fields, and dropdown items

This matches the official PoE Trade interface exactly with proper font rendering and anti-aliasing.

## Note:
The font files are not included in this repository due to licensing considerations. You'll need to add them manually to complete the visual match.
