# Captures the two Pro views with very generous sleeps.
# Run AFTER screenshots.tape to overwrite the bad versions.

Output assets/screenshots/_dummy2.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1440
Set Height 900
Set Theme "Dracula"
Set TypingSpeed 60ms
Set Padding 24

# ── Smart Cleanup ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "7"
Sleep 10s
Screenshot assets/screenshots/smart-cleanup.png
Type "q"
Sleep 1s

# ── Security Audit ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "9"
Sleep 25s
Screenshot assets/screenshots/security-audit.png
Type "q"
Sleep 1s

# ── Doctor (also re-shoot) ──
Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "5"
Sleep 8s
Screenshot assets/screenshots/doctor.png
Type "q"
Sleep 500ms
