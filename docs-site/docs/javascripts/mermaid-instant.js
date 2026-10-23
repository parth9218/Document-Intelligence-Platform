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

  // Fullscreen Auto-Zoom: listen for clicks on panzoom fullscreen toggle
  document.addEventListener('click', function (e) {
    const maxBtn = e.target.closest('.panzoom-max');
    const minBtn = e.target.closest('.panzoom-min');

    if (maxBtn) {
      const box = maxBtn.closest('.panzoom-box');
      if (box) {
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
        setTimeout(() => {
          ensureFullFrameSvgs();
        }, 50);
      }
    }
  });
})();
