(function(root){
  'use strict';
  // Core formula retained from 报价查询/split.js; no quote data or imports.
  const methods=[['分8成',0.2],['分7成',0.3],['分6成',0.4],['分2/3 VOL',1/3],['分1/2 VOL',0.5]];
  function calculate(gross,cbm,rate,addon){
    if(![gross,cbm,rate,addon].every(Number.isFinite)||gross<=0||cbm<=0||rate<=0||addon<0)throw new Error('请填写大于 0 的实重、体积、单价；ALL ON 须为非负数。');
    const volume=cbm*167,bubble=volume>gross;
    const rows=methods.map(([name,ratio])=>{
      const weight=bubble?gross+(volume-gross)*ratio:gross;
      const converted=bubble?rate*weight/volume:rate;
      return {name,ratio,weight,converted,total:converted+addon};
    });
    if(!Number.isFinite(volume)||rows.some(r=>![r.weight,r.converted,r.total].every(Number.isFinite)))throw new Error('数值过大，无法计算。');
    return {gross,cbm,rate,addon,volume,bubble,rows};
  }
  function parseInputs(values){if(values.some(v=>String(v).trim()===''))throw new Error('请填完整四项数据；不加 ALL ON 时填 0。');return calculate(...values.map(Number));}
  if(typeof module!=='undefined'&&module.exports){module.exports={calculate,parseInputs};return;}
  const $=id=>document.getElementById(id),format=n=>n.toFixed(2);
  let result=null,version=0;
  function clear(){result=null;version++;$('calc-results').replaceChildren();$('calc-output').value='';$('calc-copy').disabled=true;}
  $('calculator').addEventListener('input',()=>{clear();$('calc-status').textContent='输入已更新，请重新计算。';});
  $('calculator').addEventListener('submit',event=>{
    event.preventDefault();clear();
    try{
      if(!$('confirm').checked)throw new Error('请先确认单价的分泡收费口径。');
      result=parseInputs(['gross','cbm','rate','addon'].map(id=>$(id).value));
      const basis=result.bubble?'体积重':'实重';
      $('calc-status').textContent=`体积重 ${format(result.volume)} kg · ${result.bubble?'泡货，泡重差 '+format(result.volume-result.gross)+' kg':'非泡货，按实重计费'}`;
      result.rows.forEach(r=>{const tr=document.createElement('tr');[`${r.name} / 收泡 ${(r.ratio*100).toFixed(2)}%`,format(r.weight),format(r.converted),format(r.total)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});$('calc-results').append(tr);});
      $('calc-output').value=[`分泡测算（不替代渠道报价）`,`实重 ${format(result.gross)} kg｜体积 ${result.cbm} CBM｜体积重 ${format(result.volume)} kg（CBM × 167）`,`参与分泡单价 ${format(result.rate)}/kg；ALL ON ${format(result.addon)}/kg`,...result.rows.map(r=>`${r.name}（收泡 ${(r.ratio*100).toFixed(2)}%）：计费重 ${format(r.weight)} kg，等效单价 ${format(r.converted)}/kg，含 ALL ON ${format(r.total)}/kg（按${basis}）`),'等效单价先折算，再加 ALL ON；同一币种。未计最低收费及其他另收费，比例与口径须按渠道确认。'].join('\n');
      $('calc-copy').disabled=false;
    }catch(error){clear();$('calc-status').textContent=error.message;}
  });
  $('calc-copy').addEventListener('click',async()=>{if(!result)return;const token=++version,value=$('calc-output').value;try{await navigator.clipboard.writeText(value);if(token===version)$('calc-status').textContent='已复制测算说明。';}catch{if(token!==version)return;$('calc-output').focus();$('calc-output').select();$('calc-status').textContent='文字已全选，请按 ⌘C（Windows：Ctrl+C）复制。';}});
})(typeof globalThis!=='undefined'?globalThis:this);
