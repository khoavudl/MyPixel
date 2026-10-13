import { useEffect, useRef } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';

export const useHotkeys = (onFitToScreen?: () => void) => {
  const {
    activeTool,
    setActiveTool,
    viewport,
    setViewport,
    resetViewport,
    isSynced,
    setIsSynced,
    setIsFlickering,
    toggleFlickerTarget,
  } = useInspectionStore();

  const flickerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsFlickering(true);
        // Start fast flicker alternation between brand and vendor (3 times per second)
        if (flickerIntervalRef.current === null) {
          flickerIntervalRef.current = window.setInterval(() => {
            toggleFlickerTarget();
          }, 300);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('pan');
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('box');
      } else if (e.key === 'l' || e.key === 'L') {
        setActiveTool('loupe');
      } else if (e.key === 's' || e.key === 'S') {
        setIsSynced(!isSynced);
      } else if (e.key === '1') {
        setViewport({ zoom: 1 });
      } else if (e.key === '0') {
        if (onFitToScreen) onFitToScreen();
        else resetViewport();
      } else if (e.key === '+' || e.key === '=') {
        setViewport({ zoom: Math.min(32, viewport.zoom * 1.25) });
      } else if (e.key === '-' || e.key === '_') {
        setViewport({ zoom: Math.max(0.05, viewport.zoom * 0.8) });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlickering(false);
        if (flickerIntervalRef.current !== null) {
          clearInterval(flickerIntervalRef.current);
          flickerIntervalRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (flickerIntervalRef.current !== null) {
        clearInterval(flickerIntervalRef.current);
      }
    };
  }, [
    activeTool,
    setActiveTool,
    viewport,
    setViewport,
    resetViewport,
    isSynced,
    setIsSynced,
    setIsFlickering,
    toggleFlickerTarget,
    onFitToScreen,
  ]);
};
