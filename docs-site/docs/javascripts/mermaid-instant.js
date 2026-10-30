/**
 * AI Document Intelligence Platform — Dynamic Diagram & Instant Navigation Engine
 * Resolves:
 * 1. Immediate Mermaid rendering on Material for MkDocs instant navigation (tab switching) without manual refresh.
 * 2. Overriding Mermaid inline max-width restrictions to utilize full container frame width.
 * 3. Instant auto-zoom and centering when expanding diagrams to fullscreen mode.
 */

(function () {
  'use strict';

  // Function to initialize and render any unrendered Mermaid diagrams
  function renderMermaidDiagrams() {
    if (typeof mermaid === 'undefined') return;

    // Find all mermaid blocks that have not yet been rendered to SVG
    const nodes = document.querySelectorAll('.mermaid:not([data-processed="true"])');
    if (nodes.length === 0) {
      ensureFullFrameSvgs();
      return;
    }

    try {
      if (typeof mermaid.run === 'function') {
        mermaid.run({
          nodes: Array.from(nodes),
          suppressErrors: true,
        }).then(() => {
          ensureFullFrameSvgs();
        }).catch(() => {
          if (typeof mermaid.init === 'function') {
            mermaid.init(undefined, nodes);
            ensureFullFrameSvgs();
          }
        });
      } else if (typeof mermaid.init === 'function') {
        mermaid.init(undefined, nodes);
        ensureFullFrameSvgs();
      }
    } catch (err) {
      console.warn('Mermaid rendering notice:', err);
    }
  }

  // Ensure all SVGs expand to utilize the full available frame width
  function ensureFullFrameSvgs() {
    document.querySelectorAll('.mermaid svg').forEach((svg) => {
      svg.style.setProperty('max-width', '100%', 'important');
      svg.style.setProperty('height', 'auto', 'important');
      svg.style.setProperty('display', 'block', 'important');
      if (!svg.style.minHeight) {
        svg.style.setProperty('min-height', '160px');
      }
    });
  }

  // Hook into Material for MkDocs instant navigation observable
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function () {
      renderMermaidDiagrams();
      // Double check after layout settles
      setTimeout(renderMermaidDiagrams, 80);
      setTimeout(renderMermaidDiagrams, 250);
      setTimeout(renderMermaidDiagrams, 600);
    });
  }

  // Fallback for direct browser reloads
  window.addEventListener('DOMContentLoaded', renderMermaidDiagrams);
  window.addEventListener('load', renderMermaidDiagrams);

  // ==========================================================================
  // Touch / Mobile Support for Panzoom Toolbar:
  // anvaka/panzoom attaches a touchstart listener on .panzoom-box that calls preventDefault(),
  // which cancels the browser's synthetic click event on mobile touchscreens.
  // We intercept touch events on .panzoom-nav / .panzoom-button in the capture phase to stop propagation to .panzoom-box,
  // and trigger the button's click action immediately upon touchend (tap).
  // ==========================================================================
  let touchStartPos = null;
  let lastTouchTapTime = 0;

  document.addEventListener(
    'touchstart',
    function (e) {
      const btn = e.target.closest('.panzoom-button, .panzoom-nav, .panzoom-info-box');
      if (btn) {
        // Prevent event from bubbling up to .panzoom-box where panzoom's preventDefault() would kill click events
        e.stopPropagation();
        if (e.touches && e.touches.length > 0) {
          touchStartPos = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now(),
          };
        }
      }
    },
    { capture: true, passive: false }
  );

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (e.target.closest('.panzoom-button, .panzoom-nav, .panzoom-info-box')) {
        e.stopPropagation();
      }
    },
    { capture: true }
  );

  document.addEventListener(
    'touchmove',
    function (e) {
      if (touchStartPos && e.target.closest('.panzoom-button, .panzoom-nav, .panzoom-info-box')) {
        e.stopPropagation();
      }
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'touchend',
    function (e) {
      const btn = e.target.closest('.panzoom-button');
      if (btn) {
        e.stopPropagation();
        e.preventDefault(); // Prevent duplicate delayed synthetic click from mobile browser

        let isTap = true;
        if (touchStartPos && e.changedTouches && e.changedTouches.length > 0) {
          const dx = e.changedTouches[0].clientX - touchStartPos.x;
          const dy = e.changedTouches[0].clientY - touchStartPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const elapsed = Date.now() - touchStartPos.time;
          // If finger moved more than 15px or hold exceeded 800ms, treat as drag/cancel rather than tap
          if (dist > 15 || elapsed > 800) {
            isTap = false;
          }
        }
        touchStartPos = null;

        if (isTap) {
          lastTouchTapTime = Date.now();
          btn.click();
        }
      }
    },
    { capture: true, passive: false }
  );

  // Fullscreen Auto-Zoom: listen for clicks on panzoom fullscreen toggle
  document.addEventListener('click', function (e) {
    // If a browser-synthesized click arrives right after our fast-tap touchend handler, suppress duplicate
    if (e.isTrusted && Date.now() - lastTouchTapTime < 450) {
      const btn = e.target.closest('.panzoom-button');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }

    const maxBtn = e.target.closest('.panzoom-max');
    const minBtn = e.target.closest('.panzoom-min');

    if (maxBtn) {
      const box = maxBtn.closest('.panzoom-box');
      if (box) {
        maxBtn.classList.add('panzoom-hidden');
        const minBtnInBox = box.querySelector('.panzoom-min');
        if (minBtnInBox) {
          minBtnInBox.classList.remove('panzoom-hidden');
        }

        // Trigger panzoom reset to clear any pan offset and align to screen
        const resetBtn = box.querySelector('.panzoom-reset');
        if (resetBtn) {
          resetBtn.click();
        }

        setTimeout(() => {
          const target = box.querySelector('.architecture-diagram, .mermaid');
          if (target && target.style) {
            target.style.transform = 'matrix(1, 0, 0, 1, 0, 0)';
          }
          ensureFullFrameSvgs();
        }, 50);
      }
    }

    if (minBtn) {
      const box = minBtn.closest('.panzoom-box');
      if (box) {
        minBtn.classList.add('panzoom-hidden');
        const maxBtnInBox = box.querySelector('.panzoom-max');
        if (maxBtnInBox) {
          maxBtnInBox.classList.remove('panzoom-hidden');
        }

        setTimeout(() => {
          ensureFullFrameSvgs();
        }, 50);
      }
    }
  });
})();
