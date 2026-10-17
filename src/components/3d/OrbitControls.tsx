"use client";

import { OrbitControls as DreiOrbitControls } from "@react-three/drei";

interface OrbitControlsProps {
  autoRotate?: boolean;
  enabled?: boolean;
}

export function OrbitControls({ autoRotate = false, enabled = true }: OrbitControlsProps) {
  return (
    <DreiOrbitControls
      enabled={enabled}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.42}
      zoomSpeed={0.6}
      minDistance={2.35}
      maxDistance={9}
      autoRotate={autoRotate}
      autoRotateSpeed={0.28}
      target={[0, 0, 0]}
    />
  );
}
