const STORAGE_KEY='eiendomsalg-v2-inputs';
const WORK_MONTHS_KEY='Antall arbeidsmåneder 2027';

function fieldKey(el){
  const field=el.closest('.field');
  if(field){
    const label=field.querySelector('.field-label');
    if(label?.textContent) return label.textContent.trim();
  }
  const checkLabel=el.closest('label');
  return checkLabel?.textContent?.trim()||'';
}

function fields(){
  return Array.from(document.querySelectorAll('.field input,.field select,.checks input'));
}

function numericFields(){
  return fields().filter(el=>el.dataset.numberFormatted==='1');
}

function rawNumber(value){
  return String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
}

function formatNumber(value){
  const raw=rawNumber(value);
  return raw ? Number(raw).toLocaleString('nb-NO') : '';
}

function prepareNumericInput(el){
  if(el.type!=='number' || el.dataset.numberFormatted==='1') return;
  el.dataset.numberFormatted='1';
  el.type='text';
  el.inputMode='numeric';
  el.pattern='[0-9]*';
  el.autocomplete='off';
  el.value=rawNumber(el.value);

  el.addEventListener('focus',()=>{
    el.value=rawNumber(el.value);
    if(el.value==='0') el.select();
  });

  el.addEventListener('click',()=>{
    if(el.value==='0') el.select();
  });

  el.addEventListener('blur',()=>{
    el.value=formatNumber(el.value);
    setTimeout(save,0);
  });
}

function save(){
  try{
    const data={};
    fields().forEach(el=>{
      const key=fieldKey(el);
      if(!key) return;
      data[key]=el.type==='checkbox'?el.checked:rawNumber(el.value);
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  }catch{}
}

function restore(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      fields().forEach(el=>{
        const key=fieldKey(el);
        if(!key || !(key in data)) return;
        if(el.type==='checkbox') el.checked=Boolean(data[key]);
        else el.value=el.dataset.numberFormatted==='1'?rawNumber(data[key]):String(data[key]);
        el.dispatchEvent(new Event(el.type==='checkbox'?'change':'input',{bubbles:true}));
      });
      numericFields().forEach(el=>{
        if(document.activeElement!==el) el.value=formatNumber(el.value);
      });
      return;
    }
    const workMonths=fields().find(el=>fieldKey(el)===WORK_MONTHS_KEY);
    if(workMonths){
      workMonths.value='1';
      workMonths.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(save,0);
    }
    numericFields().forEach(el=>{el.value=formatNumber(el.value);});
  }catch{}
}

function formatIdleNumbers(){
  numericFields().forEach(el=>{
    if(document.activeElement!==el) el.value=formatNumber(el.value);
  });
}

function prepare(){
  fields().forEach(prepareNumericInput);

  document.addEventListener('input',e=>{
    const el=e.target;
    if(el?.dataset?.numberFormatted==='1') el.value=rawNumber(el.value);
    setTimeout(()=>{save();formatIdleNumbers();},0);
  },true);

  document.addEventListener('change',()=>setTimeout(()=>{save();formatIdleNumbers();},0),true);
  setTimeout(restore,50);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',prepare,{once:true});
else prepare();
