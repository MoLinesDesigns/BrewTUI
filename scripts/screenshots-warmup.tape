# Warm-up tape — runs the OSV scan once so the next capture hits the 30min cache.
# Run BEFORE screenshots-pro.tape.

Output assets/screenshots/_warmup.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1440
Set Height 900
Set Theme "Dracula"
Set TypingSpeed 60ms
Set Padding 24

Type "brewtui-bar --lang=en" Enter
Sleep 6s
Type "9"
Sleep 75s
Type "q"
Sleep 500ms
