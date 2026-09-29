// The orb is a sandboxed presentation surface. Only fixed navigation actions reach Main.
const orb = document.querySelector('.orb');
const hoverSignal = document.querySelector('#hover-signal');
const collapseSignal = document.querySelector('#collapse-signal');
let hoverTimer;
let collapseTimer;

orb.addEventListener('pointerenter', () => {
  clearTimeout(collapseTimer);
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => hoverSignal.click(), 140);
});

document.body.addEventListener('pointerenter', () => clearTimeout(collapseTimer));
document.body.addEventListener('pointerleave', () => {
  clearTimeout(hoverTimer);
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => collapseSignal.click(), 260);
});
