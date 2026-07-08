# Marketing assets

Assets referenced by the project README and used across launch channels.

## Files

| File | Used in | How to (re)generate |
|---|---|---|
| `demo.gif` | README hero, Reddit, Twitter, PH | `vhs scripts/demo.tape` |
| `screenshots/dashboard.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/outdated.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/services.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/doctor.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/smart-cleanup.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/security-audit.png` | README | `vhs scripts/screenshots.tape` |
| `screenshots/brewbar.png` | TODO — README BrewTUI-Bar section | Manual: `Cmd+Shift+4` + `Space` over the popover |

## Capture rules

- **Terminal**: 1440×900 (screenshots) or 1280×720 (GIF), font size 14-16, `dracula` theme.
- **Compression**: `pngquant --quality=80-95 *.png --ext .png --force` before commit. Target <100 KB each.
- **GIF size**: stay under 5 MB. If over, run `gifsicle -O3 --lossy=80 -o demo.gif demo.gif`.
- **Pro views** (security, cleanup) need a Pro license active in `~/.brewtui-bar/license.json`. Test PRO key is `admin@molinesdesigns.com` (built-in).

## Tooling

```bash
brew install vhs pngquant ffmpeg
```

## Notes on `brewbar.png`

The BrewTUI-Bar popover screenshot has to be captured manually because `screencapture` requires Screen Recording permission. To produce it:

1. Open BrewTUI-Bar in your menu bar (it's running if you're a Pro user).
2. Click its menu bar icon to open the popover.
3. `Cmd+Shift+4`, then press `Space`, then click the popover window.
4. Save to `assets/screenshots/brewbar.png`.
5. Run `pngquant --quality=80-95 assets/screenshots/brewbar.png --ext .png --force`.
6. Re-add the BrewTUI-Bar row to the README screenshots grid.
