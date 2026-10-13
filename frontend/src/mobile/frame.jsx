import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OverlayContext, AlertHost, FRAME_MAX_WIDTH } from './rn';
import { DatePickerHost } from './app/datetime';

/**
 * The "phone": full screen on phones; on wider screens a centred column (max 480px, full height)
 * with a hairline border and soft shadow on the canvas-coloured page. Everything that overlays the
 * app (Modal, Sheet, Confirm, toasts, Alert, date pickers) portals into this frame, so it never
 * spills over the desktop page.
 */
export function MobileFrame({ children, title, themeColor = '#F5F8FA' }) {
  const [overlay, setOverlay] = useState(null);
  useEffect(() => {
    if (title) document.title = title;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', themeColor);
  }, [title, themeColor]);
  return (
    <div className="flex min-h-[100dvh] justify-center bg-canvas">
      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas font-sans text-ink-900 antialiased sm:border-x sm:border-line sm:shadow-[0_0_48px_-16px_rgba(14,23,27,0.22)]"
        style={{ maxWidth: FRAME_MAX_WIDTH }}
        data-mobile-frame
      >
        <OverlayContext.Provider value={overlay}>
          <div className="rn-view flex-1">{children}</div>
          <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-50" data-overlay-root />
          {overlay
            ? createPortal(
                <>
                  <DatePickerHost />
                  <AlertHost />
                </>,
                overlay,
              )
            : null}
        </OverlayContext.Provider>
      </div>
    </div>
  );
}
