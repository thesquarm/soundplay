import React, { useState, useRef, useEffect } from 'react';

interface JoystickProps {
  onMove: (vector: { x: number; z: number }) => void;
  className?: string;
}

export default function Joystick({ onMove, className = '' }: JoystickProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    updatePosition(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    updatePosition(clientX, clientY);
  };

  const handleEnd = () => {
    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, z: 0 });
  };

  const updatePosition = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate offset from center
    let dx = clientX - centerX;
    let dy = clientY - centerY;

    const maxRadius = rect.width / 2 - 10; // boundary limit
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    setPosition({ x: dx, y: dy });

    // Send normalized values (-1 to 1)
    onMove({
      x: dx / maxRadius, // mapping to strafe translation
      z: -dy / maxRadius, // mapping to forward/backward translation (upwards on screen is forward)
    });
  };

  // Bind mouse/touch move events globally while dragging
  useEffect(() => {
    const globalMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const globalTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const globalEnd = () => {
      handleEnd();
    };

    if (isDragging) {
      window.addEventListener('mousemove', globalMove);
      window.addEventListener('mouseup', globalEnd);
      window.addEventListener('touchmove', globalTouchMove, { passive: false });
      window.addEventListener('touchend', globalEnd);
    }

    return () => {
      window.removeEventListener('mousemove', globalMove);
      window.removeEventListener('mouseup', globalEnd);
      window.removeEventListener('touchmove', globalTouchMove);
      window.removeEventListener('touchend', globalEnd);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      id="mobile-joystick-container"
      className={`relative w-28 h-28 rounded-full border-2 border-dashed border-zinc-400 bg-white/40 backdrop-blur-xs flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none shadow-sm ${className}`}
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        if (e.touches.length > 0) {
          handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
    >
      {/* Outer ticks */}
      <div className="absolute inset-2 rounded-full border border-zinc-200 pointer-events-none" />
      
      {/* Dynamic knob */}
      <div
        id="mobile-joystick-knob"
        className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center transition-shadow duration-100 shadow-md"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        <div className="w-3 h-3 rounded-full bg-white opacity-40" />
      </div>

      {/* Axis cross indicators */}
      <div className="absolute w-[2px] h-3 bg-zinc-300 top-0 left-1/2 -translate-x-1/2" />
      <div className="absolute w-[2px] h-3 bg-zinc-300 bottom-0 left-1/2 -translate-x-1/2" />
      <div className="absolute h-[2px] w-3 bg-zinc-300 left-0 top-1/2 -translate-y-1/2" />
      <div className="absolute h-[2px] w-3 bg-zinc-300 right-0 top-1/2 -translate-y-1/2" />
    </div>
  );
}
