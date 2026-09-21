import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  const buttonRef = useRef(null);

  function updatePosition() {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();

    const tooltipWidth = 280;

    let left =
      rect.left + rect.width / 2 - tooltipWidth / 2;

    // Prevent tooltip from going off the left side
    if (left < 12) {
      left = 12;
    }

    // Prevent tooltip from going off the right side
    if (left + tooltipWidth > window.innerWidth - 12) {
      left =
        window.innerWidth - tooltipWidth - 12;
    }

    setPosition({
      top: rect.top - 10,
      left,
    });
  }

  function showTooltip() {
    updatePosition();
    setOpen(true);
  }

  function hideTooltip() {
    setOpen(false);
  }

  function toggleTooltip() {
    if (!open) {
      updatePosition();
    }

    setOpen(!open);
  }

  useEffect(() => {
    function handlePositionChange() {
      if (open) {
        updatePosition();
      }
    }

    window.addEventListener(
      "resize",
      handlePositionChange
    );

    window.addEventListener(
      "scroll",
      handlePositionChange,
      true
    );

    return () => {
      window.removeEventListener(
        "resize",
        handlePositionChange
      );

      window.removeEventListener(
        "scroll",
        handlePositionChange,
        true
      );
    };
  }, [open]);

  return (
    <>
      <span
        className="info-tooltip"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        <button
          ref={buttonRef}
          type="button"
          className="info-icon"
          aria-label="More information"
          onClick={toggleTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
        >
          i
        </button>
      </span>

      {open &&
        createPortal(
          <div
            className="tooltip-portal"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {text}

            <div className="tooltip-arrow"></div>
          </div>,
          document.body
        )}
    </>
  );
}

export default InfoTooltip;