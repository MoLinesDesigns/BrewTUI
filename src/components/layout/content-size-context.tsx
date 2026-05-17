import React, { createContext, useContext } from 'react';
import type { ContainerSize } from '../../hooks/use-container-size.js';

const EMPTY_CONTENT_SIZE: ContainerSize = { width: 0, height: 0 };

const ContentSizeContext = createContext<ContainerSize>(EMPTY_CONTENT_SIZE);

export function ContentSizeProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ContainerSize;
}) {
  return (
    <ContentSizeContext.Provider value={value}>
      {children}
    </ContentSizeContext.Provider>
  );
}

export function useContentSize(): ContainerSize {
  return useContext(ContentSizeContext);
}
