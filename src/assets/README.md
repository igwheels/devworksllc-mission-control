# Brand assets

| File | What |
|---|---|
| `devworks-logo-source.png` | Original DevWorks logo as supplied — 1254² RGB, full-colour lockup (DW monogram + "DevWorks" wordmark + tagline) on a **white** background. Preserved as the source of truth; not referenced by the app. |
| `devworks-mark.png` | Derived dark-theme mark used in the dashboard header. Transparent background, DW monogram only, recoloured to the app palette (navy → `#E7E9EE`, blue → `#4C8DFF`). |

`devworks-mark.png` is regenerated from the source by:

```sh
node scripts/derive-logo.mjs
```

Re-run that if the source logo is replaced. See the script header for the
crop box and colour treatment.
