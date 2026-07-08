# Generates the hero GIF for the README — assets/demo.gif
# Usage: vhs scripts/demo.tape

Output assets/demo.gif

Set Shell "zsh"
Set FontSize 16
Set Width 1280
Set Height 720
Set Theme "Dracula"
Set TypingSpeed 70ms
Set PlaybackSpeed 1.0
Set Padding 24

Type "brewtui-bar --lang=en" Enter
Sleep 7s

# ── Outdated ──
Type "3"
Sleep 3500ms

# ── Services ──
Type "4"
Sleep 3000ms

# ── Doctor ──
Type "5"
Sleep 4000ms

# ── Smart Cleanup (Pro) ──
Type "7"
Sleep 4000ms

# ── Security Audit (Pro) — show the live scan ──
Type "9"
Sleep 4500ms

# ── Back to Dashboard ──
Type "1"
Sleep 2500ms

Type "q"
Sleep 500ms
