import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

interface BlinkingTextProps {
  color: string;
  intervalMs?: number;
  bold?: boolean;
  children: React.ReactNode;
}

// DS-001: gate accesibilidad — respetar NO_COLOR (freedesktop.org) y la
// senal REDUCE_MOTION (extendida desde sistemas grandes). Si cualquiera
// esta activa, no parpadear: renderizar texto estatico en bright.
//
// NO_COLOR=1 desactiva todo color en TUI; un Text dimmed sigue siendo
// parpadeo visual aunque el color sea uniforme. Mejor desactivar el
// efecto completamente en ese modo.
//
// REDUCE_MOTION lo respetan algunos terminales (iTerm respeta el system
// flag via env). En su ausencia, fallback a NO_COLOR como proxy razonable
// — un usuario con sensibilidad a parpadeos probablemente ya tiene NO_COLOR.
function shouldDisableBlink(): boolean {
  return (
    Boolean(process.env.NO_COLOR) ||
    process.env.REDUCE_MOTION === '1' ||
    process.env.ACCESSIBILITY_REDUCE_MOTION === '1'
  );
}

// Alternates between bright (full color, bold) and dim (same color, dimColor)
// on a fixed interval. Used to draw the eye to a keyboard shortcut indicator
// (e.g. the `M` that opens the side menu) without changing its hue.
export function BlinkingText({
  color,
  intervalMs = 600,
  bold = true,
  children,
}: BlinkingTextProps) {
  const blinkDisabled = shouldDisableBlink();
  const [bright, setBright] = useState(true);

  useEffect(() => {
    if (blinkDisabled) return;
    const id = setInterval(() => setBright((b) => !b), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, blinkDisabled]);

  return (
    <Text color={color} bold={bold} dimColor={!bright && !blinkDisabled}>
      {children}
    </Text>
  );
}
