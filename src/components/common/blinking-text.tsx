import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

interface BlinkingTextProps {
  color: string;
  intervalMs?: number;
  bold?: boolean;
  children: React.ReactNode;
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
  const [bright, setBright] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBright((b) => !b), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <Text color={color} bold={bold} dimColor={!bright}>
      {children}
    </Text>
  );
}
