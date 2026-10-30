// shared anchor glyph, drawn in a 100x120 box, stroke-based
exports.anchor = (color, sw=7) => `
<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="14" r="9"/>
  <line x1="50" y1="23" x2="50" y2="108"/>
  <line x1="26" y1="38" x2="74" y2="38"/>
  <path d="M10 70 Q14 104 50 108 Q86 104 90 70"/>
  <path d="M2 80 L10 66 L20 78"/>
  <path d="M98 80 L90 66 L80 78"/>
</g>`;
