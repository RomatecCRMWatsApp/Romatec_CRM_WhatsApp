import { useRef } from "react";

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: any) => void;
}

export function MapView({ className }: MapViewProps) {
  return (
    <div className={`w-full h-[300px] bg-secondary/30 rounded-xl flex items-center justify-center ${className || ''}`}>
      <p className="text-muted-foreground text-sm">Mapa indisponível</p>
    </div>
  );
}
