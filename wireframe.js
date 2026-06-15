// ============ Breakpoint indicator ============
function updateBP(){
  const w = window.innerWidth;
  const el = document.getElementById('bp-indicator');
  if(!el) return;
  let label;
  if(w >= 1280) label = 'Breakpoint: 1280px+ (Desktop)';
  else if(w >= 992) label = 'Breakpoint: 992–1279px';
  else if(w >= 768) label = 'Breakpoint: 768–991px';
  else if(w >= 576) label = 'Breakpoint: 576–767px';
  else label = 'Breakpoint: <576px';
  el.textContent = `${label} · ${w}px`;
}
window.addEventListener('resize', updateBP);
window.addEventListener('DOMContentLoaded', updateBP);

// ============ FAQ accordion ============
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-item .faq-q').forEach(q => {
    q.addEventListener('click', () => {
      q.parentElement.classList.toggle('open');
    });
  });
});
