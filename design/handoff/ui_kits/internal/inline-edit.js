// GrowwStacks OS — shared inline-edit interaction + helpers.
function gsIcons(){ if (window.lucide) lucide.createIcons(); }

let gsToastT;
function gsToast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  const m = document.getElementById('toastMsg'); if (m) m.textContent = msg;
  t.classList.add('show'); clearTimeout(gsToastT);
  gsToastT = setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

// Click-to-edit, auto-save. Markup: <div class="ie" data-ie="text"><span class="ie-val [mono]">…</span><i data-lucide="pencil" class="ie-pencil"></i></div>
function initInlineEdit(root){
  (root || document).querySelectorAll('.ie[data-ie="text"]').forEach(function(ie){
    if (ie.__wired) return; ie.__wired = true;
    ie.addEventListener('click', function(){
      if (ie.classList.contains('editing')) return;
      const valEl = ie.querySelector('.ie-val');
      const old = valEl.textContent;
      const isMono = valEl.classList.contains('mono');
      ie.classList.add('editing');
      ie.innerHTML = '<input value="' + old.replace(/"/g, '&quot;') + '"' + (isMono ? ' style="font-family:var(--font-mono);font-size:13px"' : '') + '>';
      const inp = ie.querySelector('input'); inp.focus(); inp.select();
      function val(text, trail){ return '<span class="ie-val ' + (isMono ? 'mono' : '') + '"' + (isMono ? ' style="font-size:13px"' : '') + '>' + text + '</span>' + trail; }
      function commit(){
        const nv = inp.value.trim() || old;
        ie.classList.remove('editing');
        ie.innerHTML = val(nv, '<span class="ie-saving"><i data-lucide="loader-circle" style="animation:spin 1s linear infinite"></i>Saving</span>');
        gsIcons();
        setTimeout(function(){
          ie.innerHTML = val(nv, '<span class="ie-saved"><i data-lucide="circle-check" class="ic-fill"></i>Saved</span>');
          gsIcons();
          setTimeout(function(){ ie.innerHTML = val(nv, '<i data-lucide="pencil" class="ie-pencil"></i>'); gsIcons(); ie.__wired = false; initInlineEdit(ie.parentNode); }, 1400);
        }, 650);
      }
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = old; inp.blur(); } });
    });
  });
}
