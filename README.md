# California Regional Center Education & Training Explorer

This static site reads live activity data from the public Google Sheet feed:

- Spreadsheet ID: `1I4_rxfEN4k5yiqEMEUHZyKUzVStR_c8aXvlUDxsP9u0`
- Sheet gid: `0`

## Deploy with GitHub Pages

1. Create a public GitHub repository, for example `regional-center-education-explorer`.
2. Upload `index.html`, `app.js`, `styles.css`, `.nojekyll`, and this `README.md` to the repository root.
3. In GitHub: Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save.
4. Wait a few minutes, then open the GitHub Pages URL.

## Updating the data

Edit the main/private Regional Center workbook. Its `IMPORTRANGE` feed updates the public data sheet. The site reads the public feed each time the page loads, so normal data/tag edits do not require changes to GitHub.

The site uses:
- `Activity Categories (Review/Edit)` for activity-category tags and filters.
- `Intended Audience (Review/Edit)` for intended-audience tags and filters.
- `Source Year`, `Source Title`, and `Source Link` for source display and year filtering.

If new columns or new interface behaviors are added, `app.js` may need to be updated.
