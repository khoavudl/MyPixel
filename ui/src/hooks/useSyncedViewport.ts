import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';

export const useSyncedViewport = (containerRef: React.RefObject<HTMLDivElement | null>) => {
  const { viewport, setViewport, activeTool } = useInspectionStore();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialPanX: number; initialPanY: number } | null>(null);

  // Mouse wheel zoom to cursor
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Current world coordinates under cursor
      const worldX = (mouseX - viewport.panX) / viewport.zoom;
      const worldY = (mouseY - viewport.panY) / viewport.zoom;

      // Zoom factor calculation
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(32.0, Math.max(0.05, viewport.zoom * zoomFactor));

      // Calculate new pan so (worldX, worldY) remains at (mouseX, mouseY)
      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      setViewport({
        zoom: newZoom,
        panX: newPanX,
        panY: newPanY,
      });
    },
    [containerRef, viewport, setViewport]
  );

  // Attach non-passive wheel listener to allow e.preventDefault()
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, handleWheel]);

  // Mouse Down (Start Pan)
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Allow pan on middle click, spacebar, or if activeTool is 'pan'
      const isPanAction = e.button === 1 || activeTool === 'pan' || e.buttons === 4;

      if (!isPanAction) return;
      e.preventDefault();

      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        initialPanX: viewport.panX,
        initialPanY: viewport.panY,
      };
    },
    [activeTool, viewport]
  );

  // Window mouse move & up to keep dragging outside viewport boundaries
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      setViewport({
        panX: dragStartRef.current.initialPanX + dx,
        panY: dragStartRef.current.initialPanY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setViewport]);

  return {
    onMouseDown,
    isDragging,
  };
};
