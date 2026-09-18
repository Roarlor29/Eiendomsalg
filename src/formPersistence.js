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

function rawMoney(value){
  return String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
}

function save(){
  try{
    const data={};
    fields().forEach(el=>{
      const key=fieldKey(el);
      if(!key) return;
      if(el.type==='checkbox') data[key]=el.checked;
      else if(el.dataset.money==='1') data[key]=rawMoney(el.value);
      else data[key]=el.value;
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  }catch{}
}

function prepare(){
  document.addEventListener('input',()=>setTimeout(save,0),true);
  document.addEventListener('change',()=>setTimeout(save,0),true);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',prepare,{once:true});
else prepare();
