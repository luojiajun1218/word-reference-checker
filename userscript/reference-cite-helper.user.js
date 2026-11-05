// ==UserScript==
// @name         参考文献引用助手
// @namespace    local-codex-scholar-helper
// @version      1.1.0
// @description  只对文献核对网页的链接，尝试自动展开匹配结果的引用。
// @match        https://scholar.google.com/scholar*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const params = new URL(location.href).searchParams;
  const auto = params.get('codex_auto_cite') === '1';
  const enlarge = auto || params.get('codex_cite_big') === '1';
  if (!enlarge) return;
  const style = document.createElement('style');
  style.textContent = `
    #gs_cit, .gs_md_d:has(.gs_citr), [role="dialog"]:has(.gs_citr) {width:min(980px,94vw)!important;max-width:94vw!important;max-height:88vh!important}
    #gs_citd, #gs_citd *, .gs_citr, .gs_citr * {font-size:18px!important;line-height:1.5!important}
    #codex-cite-note {padding:9px 14px;margin:8px 0;border-radius:5px;background:#edf3ff;color:#274779;font:14px/1.5 sans-serif}
  `;
  (document.head || document.documentElement).append(style);
  if (!auto) return;
  const normalize = value => value.normalize('NFKC').toLowerCase()
    .replace(/^\s*\[(?:pdf|html|citation|引用)\]\s*/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const wanted = normalize(params.get('q') || '');
  if (wanted.length < 12) return;
  let observer, timer, done = false;
  const showNote = message => {
    let container = document.querySelector('#gs_res_ccl_mid, #gs_res_ccl, main');
    if (!container || document.getElementById('codex-cite-note')) return;
    let note = document.createElement('div'); note.id = 'codex-cite-note'; note.textContent = message;
    container.prepend(note);
  };
  const finish = () => {done=true; if(observer)observer.disconnect(); if(timer)clearTimeout(timer);};
  const tryOpen = () => {
    if (done || document.querySelector('#gs_citd .gs_citr')) {finish(); return;}
    const results = Array.from(document.querySelectorAll('.gs_r.gs_or, .gs_r.gs_scl'));
    if (!results.length) return;
    const exact = results.filter(item => {
      const title = item.querySelector('.gs_rt a, .gs_rt');
      return title && normalize(title.textContent || '') === wanted;
    });
    if (exact.length !== 1) {
      finish();
      showNote('未发现唯一的完全匹配标题，请核对搜索结果并手动点击 Cite。');
      return;
    }
    const cite = exact[0].querySelector('.gs_or_cit, [aria-label="Cite"], [title="Cite"], [aria-label="引用"], [title="引用"]');
    finish();
    if (cite) cite.click();
    else showNote('匹配结果没有可自动打开的 Cite，请手动查看。');
  };
  // Scholar normally supplies the results in its first HTML response; the
  // bounded observer handles the unusual case where they arrive later.
  tryOpen();
  if (!done) {
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {scheduled=false;tryOpen();});
    });
    observer.observe(document.querySelector('#gs_res_ccl') || document.body, {childList:true,subtree:true});
    timer=setTimeout(() => {finish();showNote('搜索结果尚未就绪，请查看页面是否要求验证或手动点击 Cite。');}, 6000);
  }
})();
