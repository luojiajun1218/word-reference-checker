'use strict';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const descendants = (node, name) => node.getElementsByTagNameNS(W, name);
const wordAttr = (node, name) => node?.getAttributeNS(W, name) || '';
function wordText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && node.localName === 't') out += child.nodeValue;
    else if (child.nodeType === 1) {
      if (child.namespaceURI === W && child.localName === 'tab') out += '\t';
      else if (child.namespaceURI === W && ['br', 'cr'].includes(child.localName)) out += '\n';
      else out += wordText(child);
    }
  }
  return out;
}
function titleFromReference(reference) {
  // Bilingual references often place the Chinese citation in parentheses.
  const bilingual = reference.match(/[（(][^()（）]*?\b(?:19|20)\d{2}[a-z]?\s*[.。]\s*([^。\.]+)[.。]/i);
  if (bilingual && /[\u3400-\u9fff]/.test(bilingual[1])) return bilingual[1].trim();
  const clean = reference.replace(/^\s*(?:\[\d+\]|\d+[.、])\s*/, '');
  const year = clean.match(/\b(?:19|20)\d{2}[a-z]?[)）]?\s*[.。]\s*/i);
  let tail = year ? clean.slice(year.index + year[0].length) : '';
  if (!tail && /[\u3400-\u9fff]/.test(clean)) {
    const fields = clean.split(/[.。]/).map(s => s.trim()).filter(Boolean);
    tail = fields[1] || '';
  }
  if (!tail) return clean;
  return (tail.split(/\/\/|[.。]\s*(?=[A-Z\u3400-\u9fff])|\s*\[/)[0] || clean).replace(/[ .。]+$/, '').trim();
}
function resultLink(reference) {
  const title = titleFromReference(reference);
  const chinese = /[\u3400-\u9fff]/.test(title);
  const url = new URL(chinese ? 'https://kns.cnki.net/kns8s/defaultresult/index' : 'https://scholar.google.com/scholar');
  if (chinese) { url.searchParams.set('kw', title); url.searchParams.set('korder', 'TI'); }
  else { url.searchParams.set('q', title); url.searchParams.set('hl', 'en'); url.searchParams.set('codex_auto_cite', '1'); }
  return { url: url.href, chinese, title };
}
function paragraph(node, isReference) {
  const p = document.createElement('p');
  const style = wordAttr(descendants(node, 'pStyle')[0], 'val');
  p.className = isReference ? 'ref' : 'word-para';
  p.dataset.wordStyle = style;
  if (/heading|title/i.test(style)) p.classList.add('heading');
  let holder = p;
  if (isReference) {
    const result = resultLink(wordText(node));
    const link = document.createElement('a');
    link.href = result.url; link.target = 'reference_review_result'; link.referrerPolicy = 'no-referrer';
    link.title = (result.chinese ? '在知网搜索：' : '在 Google Scholar 搜索：') + result.title;
    p.append(link); holder = link;
    p.dataset.source = result.chinese ? '知网' : 'Google Scholar';
  }
  for (const run of descendants(node, 'r')) {
    const span = document.createElement('span'); span.textContent = wordText(run);
    const props = descendants(run, 'rPr')[0];
    if (props) {
      if (descendants(props, 'b').length) span.style.fontWeight = 'bold';
      if (descendants(props, 'i').length) span.style.fontStyle = 'italic';
      const alignment = wordAttr(descendants(props, 'vertAlign')[0], 'val');
      if (alignment === 'superscript') span.style.verticalAlign = 'super';
      if (alignment === 'subscript') span.style.verticalAlign = 'sub';
    }
    holder.append(span);
  }
  if (!holder.textContent) holder.textContent = wordText(node) || '\u00a0';
  if (isReference) { const tag = document.createElement('span'); tag.className = 'source-tag'; tag.textContent = p.dataset.source; p.append(' ', tag); }
  return p;
}
function table(node) {
  const wrap = document.createElement('div'); wrap.className = 'tablewrap';
  const t = document.createElement('table');
  for (const row of Array.from(node.children).filter(x => x.localName === 'tr')) {
    const tr = document.createElement('tr');
    for (const cell of Array.from(row.children).filter(x => x.localName === 'tc')) {
      const td = document.createElement('td');
      for (const p of Array.from(cell.children).filter(x => x.localName === 'p')) td.append(paragraph(p, false));
      tr.append(td);
    }
    t.append(tr);
  }
  wrap.append(t); return wrap;
}
const sheet = document.getElementById('sheet');
document.getElementById('back').addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
sheet.addEventListener('click', event => {
  const link = event.target.closest('.ref a'); if (!link) return;
  sheet.querySelector('.current-ref')?.classList.remove('current-ref'); link.classList.add('current-ref');
  const status = document.getElementById('click-status'); status.hidden = false;
  status.textContent = '正在打开 ' + link.parentElement.dataset.source + '，请查看搜索结果窗口。';
});
document.getElementById('wordfile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const note = document.getElementById('note');
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const part = zip.file('word/document.xml'); if (!part) throw new Error('没有找到 Word 文档正文');
    const xml = new DOMParser().parseFromString(await part.async('text'), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('无法解析 Word 文档');
    const body = descendants(xml, 'body')[0]; if (!body) throw new Error('没有找到文档正文');
    const fragment = document.createDocumentFragment(); let inReferences = false, box, count = 0;
    for (const node of body.children) {
      if (node.localName === 'tbl') { fragment.append(table(node)); continue; }
      if (node.localName !== 'p') continue;
      const text = wordText(node).trim();
      if (/^(?:参考文献(?:\s*[（(]references[）)])?|references|bibliography)$/i.test(text)) {
        inReferences = true;
        const section = document.createElement('section'); section.id = 'references';
        const heading = document.createElement('h2'); heading.textContent = text;
        box = document.createElement('div'); box.className = 'refs'; section.append(heading, box); fragment.append(section); continue;
      }
      if (inReferences && /^(作者简介|作者信息|附录|appendix)$/i.test(text)) inReferences = false;
      if (inReferences && text) { box.append(paragraph(node, true)); count++; }
      else fragment.append(paragraph(node, false));
    }
    sheet.replaceChildren(fragment);
    document.querySelector('.jump').textContent = '跳到参考文献（' + count + ' 条）';
    note.textContent = '当前读取：' + file.name + '。点击文献原文开始检索；识别结果请人工核对。文件本身不会上传。' + (count ? '' : ' 未找到参考文献标题，请检查标题是否为“参考文献”或“References”。');
    document.getElementById('click-status').hidden = true;
    window.scrollTo({top: 0});
  } catch (error) { note.textContent = '读取失败：' + error.message + '。请选择未加密的 .docx 文件。'; }
  event.target.value = '';
});
