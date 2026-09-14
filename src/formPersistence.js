const STORAGE_KEY='eiendomsalg-v2-inputs';

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

function save(){
  try{
    const data={};
    fields().forEach(el=>{
      const key=fieldKey(el);
      if(!key) return;
      data[key]=el.type==='checkbox'?el.checked:el.value;
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  }catch{}
}

function restore(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data=JSON.parse(raw);
    fields().forEach(el=>{
      const key=fieldKey(el);
      if(!key || !(key in data)) return;
      if(el.type==='checkbox') el.checked=Boolean(data[key]);
      else el.value=String(data[key]);
      el.dispatchEvent(new Event(el.type==='checkbox'?'change':'input',{bubbles:true}));
    });
  }catch{}
}

function prepare(){
  fields().forEach(el=>{
    if(el.type==='number'){
      const selectZero=()=>{if(el.value==='0') el.select();};
      el.addEventListener('focus',selectZero);
      el.addEventListener('click',selectZero);
    }
  });
  document.addEventListener('input',()=>setTimeout(save,0),true);
  document.addEventListener('change',()=>setTimeout(save,0),true);
  setTimeout(restore,50);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',prepare,{once:true});
else prepare();
