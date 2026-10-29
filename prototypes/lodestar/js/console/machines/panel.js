// The housing every machine is bolted into: a riveted panel with a stencilled name plate and the amber FOCUS lamp the
// gamepad lights. `page` says which phone drawer page shows it (desk.js).
export function machinePanel({ id, title, cls = '', plate = true }) {
  const el = document.createElement('section');
  el.className = `machine m-${id} ${cls}`.trim();
  el.dataset.machine = id;
  el.setAttribute('aria-label', title);
  el.innerHTML = `<i class="rivet tl"></i><i class="rivet tr"></i><i class="rivet bl"></i><i class="rivet br"></i>` +
    (plate ? `<header class="machine-plate"><span class="focus-lamp" aria-hidden="true"></span><span class="plate-text">${title}</span></header>` : '<span class="focus-lamp floating" aria-hidden="true"></span>') +
    `<div class="machine-body"></div>`;
  return { el, body: el.querySelector('.machine-body') };
}
