/* Adds a compact currency selector without changing debt or preference storage. */
(()=>{'use strict';
const amount=document.getElementById('total'),label=amount?.previousElementSibling,buttons=[...document.querySelectorAll('[data-cur]')];
if(!label||buttons.length<2)return;
const wrapper=document.createElement('span');wrapper.className='currency-ghost';
const select=document.createElement('select');select.id='dashboard-currency';
for(const value of ['USD','COP','EUR']){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option)}
wrapper.append(select);label.append(wrapper);
function sync(){const current=buttons.find(button=>button.classList.contains('active'))?.dataset.cur;select.value=['COP','EUR'].includes(current)?current:'USD'}
function language(){select.setAttribute('aria-label',document.documentElement.lang==='en'?'Select currency':'Seleccionar moneda')}
for(const button of buttons)button.addEventListener('click',sync);
select.addEventListener('change',()=>{const button=buttons.find(item=>item.dataset.cur===select.value);if(button)button.click();sync();select.blur()});
document.addEventListener('deudas:languagechange',language);sync();language();
})();
