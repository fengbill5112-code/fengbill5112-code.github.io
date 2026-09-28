(function(){
  'use strict';
  // Local files cannot fetch the JSON feed; open the public page without local URL details.
  if(typeof window!=='undefined'&&window.location.protocol==='file:'){
    const publicUrl='https://fengbill5112-code.github.io/cargo-news.html';
    const panel=document.getElementById('news-status');
    if(panel){
      panel.textContent='这是本机页面，正在打开网站上的最新快讯。';
      const link=document.createElement('a');
      link.href=publicUrl;
      link.textContent='点击打开全球空运快讯';
      panel.append(link);
    }
    try{window.location.replace(publicUrl);}catch{/* Keep the public link available if navigation is blocked. */}
    return;
  }
  const regions=['亚洲','欧洲','北美','拉美','中东','非洲','大洋洲'];
  function safeLink(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
  function latestScheduled(now){const offset=8*3600000,local=new Date(now+offset),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());let result=day-86400000+18*3600000-offset;for(const hours of [9.5,14,18]){const t=day+hours*3600000-offset;if(t<=now)result=t;}return result;}
  function monitorState(data,now=Date.now()){
    const runs=Array.isArray(data.runs)?data.runs:[];
    const latest=runs.reduce((best,r)=>Date.parse(r.startedAt)>Date.parse(best?.startedAt||'1970-01-01')?r:best,null);
    const status=latest?.status||(['success','partial','failed','running'].includes(data.runStatus)?data.runStatus:'unknown');
    const attempt=Date.parse(data.lastAttemptAt||latest?.startedAt||'');
    // Give each scheduled search two hours to finish and reach the website.
    const stale=!Number.isFinite(attempt)||attempt<latestScheduled(now-2*3600000);
    return {status,stale,latest,successful:data.lastSuccessfulCheck||null};
  }
  function sortedItems(items){
    const key=item=>{
      const updated=Date.parse(item.updatedAt||'');
      if(Number.isFinite(updated))return updated;
      const match=String(item.evidenceThrough||'').match(/\d{4}-\d{2}-\d{2}/);
      if(!match)return -Infinity;
      const parsed=Date.parse(match[0]+'T00:00:00Z');
      return Number.isFinite(parsed)?parsed:-Infinity;
    };
    return items.map((item,index)=>({item,index,key:key(item)})).sort((a,b)=>a.key===b.key?a.index-b.index:b.key-a.key).map(entry=>entry.item);
  }
  function matches(item,query,region,type){const text=[item.title,item.titleEn,item.fact,item.factEn,item.impact,item.impactEn,item.action,item.actionEn,...(Array.isArray(item.airports)?item.airports:[item.airports||''])].join(' ').toLocaleLowerCase();return (!query||text.includes(query.toLocaleLowerCase()))&&(!region||item.region===region)&&(!type||item.type===type);}
  if(typeof module!=='undefined'&&module.exports){module.exports={safeLink,monitorState,matches,latestScheduled,sortedItems};return;}
  const $=id=>document.getElementById(id),node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
  let data=null;
  function time(value,empty='未记录'){if(!value)return empty;const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'时间格式无效';}
  function renderStatus(){
    const state=monitorState(data),panel=$('news-status');
    panel.replaceChildren(node('h2',({'success':'完整检查完成','partial':'部分覆盖','failed':'最近检查失败','running':'正在检查'})[state.status]||'运行状态未确认'));
    if(state.stale)panel.append(node('p','更新延迟：超过预定更新窗口，尚未见新的运行记录。','status-warning'));
    if(data.runStatus&&!['success','partial','failed','running'].includes(data.runStatus))panel.append(node('p',data.runStatus));
    const grid=node('div',undefined,'status-grid');
    [['最近尝试',data.lastAttemptAt],['最近完成',data.lastCompletedAt],['最近完整检查',data.lastSuccessfulCheck],['网站数据更新',data.pageUpdated]].forEach(([label,value])=>grid.append(node('p',label+'：'+time(value,label==='最近完整检查'?'尚无完整检查记录':'未记录'))));
    panel.append(grid);
    const run=state.latest;
    if(run){
      const count=value=>Number.isInteger(value)&&value>=0?value:'未记录';
      panel.append(node('p',`本轮新增：${count(run.added)} 条 · 更新：${count(run.updated)} 条`));
      panel.append(node('p','本轮实际搜索地区：'+(Array.isArray(run.regionsSearched)&&run.regionsSearched.length?run.regionsSearched.join('、'):'未记录')));
      if(run.unsearchedRegions?.length)panel.append(node('p','未搜索地区：'+run.unsearchedRegions.join('、'),'status-warning'));
      if(Array.isArray(run.sourceGaps)&&run.sourceGaps.length){
        const details=node('details',undefined,'status-gaps'),list=node('ul');
        details.append(node('summary',`查看本轮核查缺口（${run.sourceGaps.length} 项）`));
        run.sourceGaps.forEach(gap=>list.append(node('li',typeof gap==='string'?gap:JSON.stringify(gap))));
        details.append(list);
        panel.append(details);
      }
    }
    if(state.status==='failed')panel.append(node('p','本次失败不代表没有新新闻；以下保留上次有效事件，需查看各条证据截至时间。'));
    if(state.status==='partial')panel.append(node('p','本轮未完成全部覆盖。历史事件涉及的地区不代表本轮搜索范围。'));
    panel.append(node('p','预定更新：每天北京时间 09:30、14:00、18:00。事件状态不是订舱、接受或可售舱位确认。','tool-note'));
  }
  function renderItems(){const en=$('news-language').value==='en',items=sortedItems(data.items).filter(item=>matches(item,$('news-search').value.trim(),$('news-region').value,$('news-type').value));$('news-count').textContent=`显示 ${items.length} / ${data.items.length} 条事件`;$('news-items').replaceChildren();items.forEach(item=>{const article=node('article',undefined,'news-card');article.append(node('h2',en&&item.titleEn?item.titleEn:item.title));article.append(node('p',`${item.region} · ${item.type} · ${item.state} · ${Array.isArray(item.airports)?item.airports.join(' / '):(item.airports||'')}`,'news-meta'));article.append(node('p',`发生日期：${item.occurred||'未记录'}｜证据截至：${item.evidenceThrough||'未记录'}｜置信度：${item.confidence||'未记录'}`,'news-meta'));if(en&&!item.titleEn)article.append(node('p','此历史条目尚无英文摘要，显示中文原文。','news-meta'));[['事实','fact','factEn'],['影响推断','impact','impactEn'],['跟单事项','action','actionEn']].forEach(([label,zh,eng])=>{article.append(node('h3',label),node('p',en&&item[eng]?item[eng]:(item[zh]||'未记录')));});const details=node('details');details.append(node('summary','查看来源证据'));const list=node('ul');(Array.isArray(item.sources)?item.sources:[]).forEach(source=>{if(!Array.isArray(source))return;const li=node('li'),url=safeLink(source[1]);if(url){const a=node('a',source[0]||'原文来源');a.href=url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);}else li.append(node('span',(source[0]||'来源')+'（链接不可用）'));list.append(li);});if(!list.children.length)list.append(node('li','暂无可用来源链接'));details.append(list);article.append(details);$('news-items').append(article);});if(!items.length)$('news-items').append(node('p','没有符合当前筛选的事件。'));}
  $('news-filters').addEventListener('submit',event=>event.preventDefault());$('news-filters').addEventListener('input',()=>{if(data)renderItems();});$('news-print').addEventListener('click',()=>{const all=[...document.querySelectorAll('#news-items details')],states=all.map(n=>n.open);all.forEach(n=>n.open=true);const restore=()=>{all.forEach((n,i)=>n.open=states[i]);window.removeEventListener('afterprint',restore);};window.addEventListener('afterprint',restore);window.print();});
  fetch('cargo-news-data.json',{cache:'no-store',credentials:'omit'}).then(response=>{if(!response.ok)throw new Error('新闻数据读取失败（HTTP '+response.status+'）');return response.json();}).then(value=>{if(value.schemaVersion!==1||!Array.isArray(value.items))throw new Error('新闻数据格式未通过检查');data=value;[['news-region',regions.filter(region=>data.items.some(item=>item.region===region))],['news-type',[...new Set(data.items.map(item=>item.type).filter(Boolean))]]].forEach(([id,values])=>values.forEach(value=>{const option=node('option',value);option.value=value;$(id).append(option);}));renderStatus();renderItems();}).catch(error=>{$('news-status').replaceChildren(node('h2','暂时无法读取新闻数据'),node('p',error.message),node('p','无法判断本次检索或发布状态，请稍后刷新。'));$('news-print').disabled=true;});
})();
