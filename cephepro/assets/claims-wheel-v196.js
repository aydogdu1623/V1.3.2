/* V196: keep wheel scrolling inside the active hakediş dialog. */
(() => {
  'use strict';
  document.addEventListener('wheel', event => {
    const target = event.target instanceof Element ? event.target : null;
    const dialog = target?.closest('#cl-pane dialog[open]');
    if (!dialog) return;

    // Preserve browser zoom and keep older workspace listeners out of this dialog.
    event.stopImmediatePropagation();
    if (event.ctrlKey) return;
    event.preventDefault();

    const chain = [];
    for (let node = target; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      chain.push({ node, style });
      if (node === dialog) break;
    }
    const scroll = (axis, delta) => {
      if (!delta) return;
      const vertical = axis === 'Y';
      const position = vertical ? 'scrollTop' : 'scrollLeft';
      const size = vertical ? 'clientHeight' : 'clientWidth';
      const extent = vertical ? 'scrollHeight' : 'scrollWidth';
      const eligible = chain.filter(({ node, style }) =>
        /^(auto|scroll|overlay)$/.test(style['overflow' + axis] || style.overflow) &&
        node[extent] > node[size]);
      if (!eligible.length) return;
      const first = eligible[0];
      // WheelEvent deltas may be pixels, text lines, or viewport pages.
      const unit = event.deltaMode === 1 ? (parseFloat(first.style.lineHeight) || 16)
        : event.deltaMode === 2 ? first.node[size] : 1;
      let remaining = delta * unit;
      for (const { node } of eligible) {
        const before = Math.max(0, Math.min(node[position], node[extent] - node[size]));
        const after = Math.max(0, Math.min(before + remaining, node[extent] - node[size]));
        node[position] = after;
        remaining -= after - before;
        if (Math.abs(remaining) < 0.01) break;
      }
    };
    scroll('X', event.deltaX || (event.shiftKey ? event.deltaY : 0));
    if (!event.shiftKey) scroll('Y', event.deltaY);
  }, { capture: true, passive: false });
})();
