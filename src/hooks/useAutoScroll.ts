// src/hooks/useAutoScroll.ts
import { useRef, useEffect, useCallback, useState, type RefObject } from 'react';

export interface UseAutoScrollOptions {
  deps?: unknown[];
  threshold?: number;
  enabled?: boolean;
  behavior?: ScrollBehavior;
  onScrollStateChange?: (isNearBottom: boolean) => void;
  onAutoScroll?: () => void;
}

export interface UseAutoScrollReturn {
  containerRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  scrollToBottom: () => void;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  isEnabled: boolean;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const {
    deps = [],
    threshold = 24,
    enabled: initialEnabled = true,
    behavior = 'smooth',
    onScrollStateChange,
    onAutoScroll,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrollRef = useRef(false);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isEnabled, setIsEnabled] = useState(initialEnabled);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    const bottom = bottomRef.current;

    if (!container) return;

    if (bottom) {
      bottom.scrollIntoView({ behavior, block: 'end' });
    } else {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    }

    onAutoScroll?.();
  }, [behavior, onAutoScroll]);

  const checkIfNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const near = distanceFromBottom <= threshold;

    if (near !== isNearBottom) {
      setIsNearBottom(near);
      onScrollStateChange?.(near);
    }

    return near;
  }, [threshold, isNearBottom, onScrollStateChange]);

  const handleScroll = useCallback(() => {
    const near = checkIfNearBottom();
    isUserScrollRef.current = !near;
  }, [checkIfNearBottom]);

  useEffect(() => {
    if (!isEnabled) return;

    const near = checkIfNearBottom();
    const shouldScroll = near || !isUserScrollRef.current;

    if (shouldScroll) {
      scrollToBottom();
    }
  }, [deps, isEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const near = checkIfNearBottom();
      if (near) {
        isUserScrollRef.current = false;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfNearBottom]);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkIfNearBottom();
      if (isEnabled) {
        scrollToBottom();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const enable = useCallback(() => {
    setIsEnabled(true);
    scrollToBottom();
  }, [scrollToBottom]);

  const disable = useCallback(() => setIsEnabled(false), []);
  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  return {
    containerRef,
    bottomRef,
    isNearBottom,
    scrollToBottom,
    enable,
    disable,
    toggle,
    isEnabled,
  };
}

export default useAutoScroll;