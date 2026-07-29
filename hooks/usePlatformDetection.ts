import { useState } from 'react';

export const usePlatformDetection = () => {
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIphone = /iphone|ipod|ipad/.test(userAgent);
    const isMacWithTouch = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isIphone || isMacWithTouch;
  });

  return { isIOS };
};
