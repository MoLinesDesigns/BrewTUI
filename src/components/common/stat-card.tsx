import React from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from '../../hooks/use-terminal-size.js';
import { COLORS } from '../../utils/colors.js';
import { SPACING } from '../../utils/spacing.js';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
}

export function StatCard({ label, value, color = COLORS.white }: StatCardProps) {
  const { columns } = useTerminalSize();
  // Adapt min width to terminal: tight on narrow, comfortable on wide
  const minW = columns < 60 ? 12 : columns < 100 ? 14 : 16;

  return (
    <Box
      borderStyle="round"
      borderColor={color}
      paddingX={SPACING.sm}
      paddingY={SPACING.none}
      flexDirection="column"
      alignItems="center"
      flexShrink={1}
      minWidth={minW}
    >
      <Text bold color={color}>{value}</Text>
      <Text color={COLORS.muted}>{label}</Text>
    </Box>
  );
}
