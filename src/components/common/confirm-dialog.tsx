import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { COLORS } from '../../utils/colors.js';
import { t, useLocaleStore } from '../../i18n/index.js';
import { useModalStore } from '../../stores/modal-store.js';
import { SPACING } from '../../utils/spacing.js';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const locale = useLocaleStore((s) => s.locale);
  const { openModal, closeModal } = useModalStore();

  useEffect(() => {
    openModal();
    return () => { closeModal(); };
  }, []);

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onConfirm();
    else if (locale === 'es' && (input === 's' || input === 'S')) onConfirm();
    else if (input === 'n' || input === 'N') onCancel();
    else if (key.escape) onCancel();
  });

  return (
    <Box borderStyle="double" borderColor={COLORS.purple} paddingX={SPACING.sm} paddingY={SPACING.xs} flexDirection="column" flexShrink={1}>
      <Text bold color={COLORS.text} wrap="wrap">{message}</Text>
      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.success}>{t('confirm_yes')}</Text>
        <Text> / </Text>
        <Text color={COLORS.error}>{t('confirm_no')}</Text>
      </Box>
    </Box>
  );
}
