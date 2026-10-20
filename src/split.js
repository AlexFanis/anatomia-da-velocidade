// Quebra o texto de um elemento em .word > .char, preservando tags internas (ex.: <em>).
// Leitores de tela usam o aria-label do título; os spans ficam ocultos para eles.
export function splitChars(el) {
  const chars = [];

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        continue;
      }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.append(document.createTextNode(' '));
          return;
        }
        const word = document.createElement('span');
        word.className = 'word';
        word.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'char';
          c.textContent = ch;
          word.append(c);
          chars.push(c);
        }
        frag.append(word);
      });
      child.replaceWith(frag);
    }
  };

  walk(el);
  return chars;
}
