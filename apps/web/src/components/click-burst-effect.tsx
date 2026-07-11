'use client';

import { useEffect } from 'react';

// On every desktop mouse click, 4 short lines fan out from the click point and
// fade (~800ms). Uses mix-blend-mode: difference so it reads on any background.
// Auto-disabled on touch devices and when the OS has "reduce motion" on.
const fanAngles = [-50, -16, 16, 50];
const fanTiltLeft = -14;
const startGap = 14;
const travelDistance = 36;

export default function ClickBurstEffect() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!window.matchMedia('(pointer: fine)').matches) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      fanAngles.forEach((baseAngle) => {
        const angle = baseAngle + fanTiltLeft;
        const radians = (angle * Math.PI) / 180;
        const startX = Math.sin(radians) * startGap;
        const startY = -Math.cos(radians) * startGap;
        const endX = Math.sin(radians) * travelDistance;
        const endY = -Math.cos(radians) * travelDistance;

        const line = document.createElement('span');
        line.className = 'click-burst-line';
        line.style.left = `${event.clientX}px`;
        line.style.top = `${event.clientY}px`;
        line.style.setProperty('--start-x', `${startX}px`);
        line.style.setProperty('--start-y', `${startY}px`);
        line.style.setProperty('--end-x', `${endX}px`);
        line.style.setProperty('--end-y', `${endY}px`);
        line.style.setProperty('--angle', `${angle}deg`);
        line.addEventListener('animationend', () => line.remove(), { once: true });
        document.body.appendChild(line);
      });
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return null;
}
