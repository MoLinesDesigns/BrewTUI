import React, { useRef } from 'react';
import { Box, type DOMElement } from 'ink';
import { Header } from './header.js';
import { Footer } from './footer.js';
import { SPACING } from '../../utils/spacing.js';
import { useTerminalSize } from '../../hooks/use-terminal-size.js';
import { useContainerSize } from '../../hooks/use-container-size.js';
import { ContentSizeProvider } from './content-size-context.js';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { rows } = useTerminalSize();
  const contentRef = useRef<DOMElement>(null);
  const contentSize = useContainerSize(contentRef);
  const innerContentSize = {
    width: Math.max(0, contentSize.width - SPACING.sm * 2),
    height: Math.max(0, contentSize.height - SPACING.xs * 2),
  };

  return (
    <Box flexDirection="column" width="100%" height={rows} overflow="hidden">
      <Box flexShrink={0}>
        <Header />
      </Box>
      <Box
        ref={contentRef}
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
        overflow="hidden"
        paddingX={SPACING.sm}
        paddingY={SPACING.xs}
      >
        <ContentSizeProvider value={innerContentSize}>
          {children}
        </ContentSizeProvider>
      </Box>
      <Box flexShrink={0}>
        <Footer />
      </Box>
    </Box>
  );
}
