# VHS tape — captures every BrewTUI-Bar view as PNG into assets/screenshots/
# Usage: vhs scripts/screenshots.tape
#
# We launch a fresh brewtui-bar session for each view and wait generously after
# each navigation so the data layer (parallel brew calls) finishes before
# the screenshot fires.

Output assets/screenshots/_dummy.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1440
Set Height 900
Set Theme "Dracula"
Set TypingSpeed 60ms
Set Padding 24

# ── Dashboard ──
Type "brewtui-bar --lang=en" Enter
Sleep 8s
Screenshot assets/screenshots/dashboard.png
Type "q"
Sleep 1s

# ── Outdated ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "3"
Sleep 5s
Screenshot assets/screenshots/outdated.png
Type "q"
Sleep 1s

# ── Services ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "4"
Sleep 5s
Screenshot assets/screenshots/services.png
Type "q"
Sleep 1s

# ── Doctor ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "5"
Sleep 8s
Screenshot assets/screenshots/doctor.png
Type "q"
Sleep 1s

# ── Smart Cleanup (Pro) ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "7"
Sleep 8s
Screenshot assets/screenshots/smart-cleanup.png
Type "q"
Sleep 1s

# ── Security Audit (Pro) — captures the live scanning state ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "9"
Sleep 4s
Screenshot assets/screenshots/security-audit.png
Type "q"
Sleep 500ms
