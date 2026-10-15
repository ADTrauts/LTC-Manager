"use client";

import { useEffect, useRef, type PointerEvent } from "react";

type Props = {
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
};

export function EvidenceSignaturePad({ disabled, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#18181b";
    context.lineWidth = 2;
    context.lineCap = "round";
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function emit() {
    const canvas = canvasRef.current;
    onChange(canvas ? canvas.toDataURL("image/png") : null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        data-testid="evidence-signature-pad"
        className="h-32 w-full touch-none rounded-md border border-zinc-300 bg-white"
        onPointerDown={(event) => {
          if (disabled) return;
          drawing.current = true;
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!context) return;
          const next = point(event);
          context.beginPath();
          context.moveTo(next.x, next.y);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawing.current || disabled) return;
          const context = canvasRef.current?.getContext("2d");
          if (!context) return;
          const next = point(event);
          context.lineTo(next.x, next.y);
          context.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          emit();
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className="text-sm underline"
        onClick={() => {
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!canvas || !context) return;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          onChange(null);
        }}
      >
        Clear signature
      </button>
    </div>
  );
}
