import type { Ref } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isScrolledToBottom } from '../utils/terminal';

const LINE_HEIGHT_PX = 16;
const OVERSCAN_LINES = 12;

interface VirtualTerminalOutputProps {
  id?: string;
  lines: readonly string[];
  revision: number;
  className?: string;
  outputRef?: Ref<HTMLDivElement>;
}

export function VirtualTerminalOutput({
  id,
  lines,
  revision,
  className,
  outputRef,
}: VirtualTerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 240 });

  useEffect(() => {
    if (!outputRef || typeof outputRef === 'function') {
      return;
    }
    outputRef.current = containerRef.current;
    return () => {
      outputRef.current = null;
    };
  }, [outputRef]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      setViewport((current) => ({
        ...current,
        height: node.clientHeight,
      }));
    });
    observer.observe(node);
    setViewport((current) => ({
      ...current,
      height: node.clientHeight,
    }));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || !stickToBottomRef.current) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    setViewport((current) => ({
      ...current,
      scrollTop: node.scrollTop,
    }));
  }, [revision, lines.length]);

  const totalHeight = Math.max(lines.length, 1) * LINE_HEIGHT_PX;
  const startIndex = Math.max(
    0,
    Math.floor(viewport.scrollTop / LINE_HEIGHT_PX) - OVERSCAN_LINES,
  );
  const visibleCount = Math.ceil(viewport.height / LINE_HEIGHT_PX) + OVERSCAN_LINES * 2;
  const endIndex = Math.min(lines.length, startIndex + visibleCount);
  const visibleLines = lines.slice(startIndex, endIndex);

  const handleScroll = () => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    stickToBottomRef.current = isScrolledToBottom(node);
    setViewport({
      scrollTop: node.scrollTop,
      height: node.clientHeight,
    });
  };

  return (
    <div
      ref={containerRef}
      id={id}
      class={className}
      onScroll={handleScroll}
      role="log"
      aria-live="off"
    >
      <div class="terminal-virtual-spacer" style={{ height: `${totalHeight}px` }}>
        <pre
          class="terminal-virtual-window"
          style={{ transform: `translateY(${startIndex * LINE_HEIGHT_PX}px)` }}
        >
          {visibleLines.join('\n')}
        </pre>
      </div>
    </div>
  );
}
