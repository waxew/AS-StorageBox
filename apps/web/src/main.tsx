import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Page = 'files' | 'shared' | 'trash' | 'profile' | 'settings' | 'about';
type Item = { id:string; name:string; kind:'file'|'folder'; size?:number; mime?:string; folderId?:string|null; trashed?:boolean; shared?:boolean };
type Toast = { text:string; tone?:'ok'|'error' } | null;

const seed: Item[] = [];
const pageTitle: Record<Page,string> = {
  files:'فایل‌های من', shared:'اشتراک‌گذاری شده با من', trash:'سطل زباله',
  profile:'حساب کاربری', settings:'تنظیمات', about:'درباره نرم‌افزار'
};

function bytes(value=0){
  if(value < 1024) return `${value} B`;
  if(value < 1024*1024) return `${(value/1024).toFixed(1)} KB`;
  if(value < 1024*1024*1024) return `${(value/1024/1024).toFixed(1)} MB`;
  return `${(value/1024/1024/1024).toFixed(1)} GB`;
}

function loadItems():Item[]{
  try { return JSON.parse(localStorage.getItem('storagebox.items') || '[]'); } catch { return seed; }
}
function saveItems(items:Item[]){ localStorage.setItem('storagebox.items', JSON.stringify(items)); }

async function api(path:string, init:RequestInit={}){
  const base = localStorage.getItem('storagebox.api')?.replace(/\/$/,'');
  const token = localStorage.getItem('storagebox.token');
  if(!base) throw new Error('SERVER_NOT_CONFIGURED');
  const headers = new Headers(init.headers || {});
  if(token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${base}${path}`, {...init, headers});
}

function App(){
  const [page,setPage]=useState<Page>('files');
  const [items,setItems]=useState<Item[]>(loadItems);
  const [query,setQuery]=useState('');
  const [toast,setToast]=useState<Toast>(null);
  const [drawer,setDrawer]=useState(false);
  const [dialog,setDialog]=useState<'add'|'folder'|'share'|'rename'|null>(null);
  const [selected,setSelected]=useState<Item|null>(null);
  const [busy,setBusy]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const fileInput=useRef<HTMLInputElement>(null);

  useEffect(()=>saveItems(items),[items]);
  useEffect(()=>{
    const on=()=>setOnline(true), off=()=>setOnline(false);
    addEventListener('online',on); addEventListener('offline',off);
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>undefined);
    return ()=>{removeEventListener('online',on);removeEventListener('offline',off)};
  },[]);
  useEffect(()=>{ if(!toast) return; const id=setTimeout(()=>setToast(null),2600); return ()=>clearTimeout(id); },[toast]);

  const visible=useMemo(()=>items.filter(i=>{
    const state = page==='trash' ? i.trashed : !i.trashed;
    const scope = page==='shared' ? i.shared : page==='files' ? !i.shared : true;
    return state && scope && i.name.toLowerCase().includes(query.toLowerCase());
  }),[items,page,query]);
  const used=items.filter(i=>i.kind==='file'&&!i.trashed).reduce((n,i)=>n+(i.size||0),0);

  function notify(text:string,tone:'ok'|'error'='ok'){ setToast({text,tone}); }
  function open(pageName:Page){ setPage(pageName); setDrawer(false); setQuery(''); }
  function addFolder(name:string){
    const clean=name.trim(); if(!clean) return;
    setItems(v=>[{id:crypto.randomUUID(),name:clean,kind:'folder'},...v]);
    setDialog(null); notify('پوشه ساخته شد');
  }
  async function uploadFile(file:File){
    setBusy(true);
    try{
      const res=await api('/api/v1/uploads/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type||'application/octet-stream',sizeBytes:file.size})});
      if(!res.ok) throw new Error(`HTTP_${res.status}`);
      const session=await res.json();
      const put=await fetch(session.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
      if(!put.ok) throw new Error('UPLOAD_FAILED');
      const done=await api(`/api/v1/uploads/sessions/${session.sessionId}/complete`,{method:'POST'});
      if(!done.ok) throw new Error('FINALIZE_FAILED');
      notify('فایل روی فضای ابری آپلود شد');
      await refreshFiles();
    }catch(error){
      // Metadata is kept locally so the PWA remains usable while offline or before server setup.
      setItems(v=>[{id:crypto.randomUUID(),name:file.name,kind:'file',size:file.size,mime:file.type},...v]);
      notify(error instanceof Error && error.message==='SERVER_NOT_CONFIGURED' ? 'فایل محلی ثبت شد؛ برای آپلود ابری آدرس سرور را در تنظیمات وارد کنید.' : 'ارتباط با سرور برقرار نشد؛ فایل در فهرست محلی ثبت شد.','error');
    }finally{setBusy(false)}
  }
  async function refreshFiles(){
    try{
      const res=await api('/api/v1/files'); if(!res.ok) return;
      const body=await res.json();
      const remote:Item[]=(body.files||[]).map((f:any)=>({id:f.id,name:f.name,kind:'file',size:Number(f.sizeBytes||0),mime:f.mimeType}));
      setItems(v=>[...remote,...v.filter(i=>i.kind==='folder'||i.shared||i.trashed)]);
    }catch{ /* Offline mode intentionally keeps cached local metadata. */ }
  }
  async function loadShared(){
    try{
      const res=await api('/api/v1/shared'); if(!res.ok) return;
      const body=await res.json();
      const remote:Item[]=(body.items||body.shares||[]).map((x:any)=>({id:x.id||x.resourceId,name:x.name||'مورد اشتراکی',kind:x.resourceType==='FOLDER'?'folder':'file',size:Number(x.sizeBytes||0),shared:true}));
      setItems(v=>[...v.filter(i=>!i.shared),...remote]);
    }catch{ /* Cached shared list remains visible. */ }
  }
  useEffect(()=>{ if(page==='files') refreshFiles(); if(page==='shared') loadShared(); },[page]);

  function trash(item:Item){ setItems(v=>v.map(i=>i.id===item.id?{...i,trashed:true}:i)); notify('به سطل زباله منتقل شد'); }
  function restore(item:Item){ setItems(v=>v.map(i=>i.id===item.id?{...i,trashed:false}:i)); notify('بازیابی شد'); }
  function removeForever(item:Item){ setItems(v=>v.filter(i=>i.id!==item.id)); notify('برای همیشه حذف شد'); }
  function rename(name:string){ if(!selected) return; setItems(v=>v.map(i=>i.id===selected.id?{...i,name:name.trim()||i.name}:i)); setDialog(null); notify('نام تغییر کرد'); }
  async function share(email:string){
    if(!selected) return;
    try{
      const res=await api('/api/v1/shares/direct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resourceType:selected.kind==='folder'?'FOLDER':'FILE',resourceId:selected.id,recipientEmail:email,permissions:['READ','DOWNLOAD']})});
      if(!res.ok) throw new Error(); notify('اشتراک‌گذاری انجام شد'); setDialog(null);
    }catch{ notify('برای اشتراک‌گذاری واقعی، اتصال Backend باید فعال باشد.','error'); }
  }

  return <div className="shell">
    <aside className={drawer?'drawer open':'drawer'}>
      <div className="brand"><span className="brandIcon">☁️</span><div><b>AS StorageBox</b><small>فضای ابری خصوصی</small></div></div>
      <nav>
        <Nav label="فایل‌های من" icon="📂" active={page==='files'} onClick={()=>open('files')}/>
        <Nav label="اشتراک‌گذاری شده" icon="👥" active={page==='shared'} onClick={()=>open('shared')}/>
        <Nav label="سطل زباله" icon="🗑️" active={page==='trash'} onClick={()=>open('trash')}/>
        <div className="navDivider"/>
        <Nav label="حساب کاربری" icon="👤" active={page==='profile'} onClick={()=>open('profile')}/>
        <Nav label="تنظیمات" icon="⚙️" active={page==='settings'} onClick={()=>open('settings')}/>
        <Nav label="درباره نرم‌افزار" icon="ℹ️" active={page==='about'} onClick={()=>open('about')}/>
      </nav>
      <footer><b>Develop by AS Team Group</b><span>نسخه وب 1.1.0</span></footer>
    </aside>
    {drawer&&<button className="backdrop" aria-label="بستن منو" onClick={()=>setDrawer(false)}/>}

    <main>
      <header className="topbar">
        <button className="mobileMenu" onClick={()=>setDrawer(true)}>☰</button>
        <div><h1>{pageTitle[page]}</h1><p>{online?'آنلاین':'آفلاین — اطلاعات کش‌شده در دسترس است'}</p></div>
        <div className="topActions">
          {(page==='files'||page==='shared'||page==='trash')&&<input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجو…"/>}
          {page==='files'&&<button className="primary" onClick={()=>setDialog('add')}>＋ افزودن</button>}
        </div>
      </header>

      {page==='files'&&<>
        <section className="quota"><div><b>فضای ذخیره‌سازی</b><span>{bytes(used)} مصرف‌شده</span></div><progress value={Math.min(used/(1024*1024*1024)*100,100)} max="100"/><small>سقف پیش‌فرض حساب: 1 GB</small></section>
        <Items title="فایل‌ها و پوشه‌ها" items={visible} empty="هنوز فایل یا پوشه‌ای ندارید." onMenu={(i)=>{setSelected(i);setDialog('rename')}}/>
      </>}
      {page==='shared'&&<Items title="مواردی که دیگران با شما به اشتراک گذاشته‌اند" items={visible} empty="هنوز چیزی با شما به اشتراک گذاشته نشده است." onMenu={(i)=>setSelected(i)}/>} 
      {page==='trash'&&<Items title="موارد حذف‌شده" items={visible} empty="سطل زباله خالی است." trashMode onRestore={restore} onDelete={removeForever}/>} 
      {page==='profile'&&<Profile/>}
      {page==='settings'&&<Settings notify={notify}/>} 
      {page==='about'&&<About/>}
    </main>

    {dialog==='add'&&<Modal title="افزودن" onClose={()=>setDialog(null)}><div className="actionGrid"><button onClick={()=>setDialog('folder')}>📁<b>پوشه جدید</b></button><button onClick={()=>fileInput.current?.click()}>📤<b>آپلود فایل</b></button></div></Modal>}
    {dialog==='folder'&&<PromptModal title="ساخت پوشه" placeholder="نام پوشه" submit="ساخت" onClose={()=>setDialog(null)} onSubmit={addFolder}/>} 
    {dialog==='rename'&&selected&&<Modal title={selected.name} onClose={()=>setDialog(null)}><div className="menuList"><button onClick={()=>setDialog('share')}>🔗 اشتراک‌گذاری</button><button onClick={()=>{const n=prompt('نام جدید',selected.name);if(n) rename(n)}}>✏️ تغییر نام</button><button onClick={()=>{trash(selected);setDialog(null)}}>🗑️ انتقال به سطل زباله</button></div></Modal>}
    {dialog==='share'&&selected&&<PromptModal title={`اشتراک‌گذاری ${selected.name}`} placeholder="ایمیل گیرنده" submit="اشتراک‌گذاری" onClose={()=>setDialog(null)} onSubmit={share}/>} 
    <input ref={fileInput} hidden type="file" multiple onChange={e=>{[...(e.target.files||[])].forEach(uploadFile);e.currentTarget.value='';setDialog(null)}}/>
    {busy&&<div className="busy">در حال انجام عملیات…</div>}
    {toast&&<div className={`toast ${toast.tone||'ok'}`}>{toast.text}</div>}
  </div>
}

function Nav({label,icon,active,onClick}:{label:string;icon:string;active:boolean;onClick:()=>void}){return <button className={active?'nav active':'nav'} onClick={onClick}><span>{icon}</span>{label}</button>}
function Items({title,items,empty,onMenu,trashMode,onRestore,onDelete}:{title:string;items:Item[];empty:string;onMenu?:(i:Item)=>void;trashMode?:boolean;onRestore?:(i:Item)=>void;onDelete?:(i:Item)=>void}){
  return <section><div className="sectionHead"><h2>{title}</h2><span>{items.length} مورد</span></div>{items.length===0?<div className="empty"><div>☁️</div><b>{empty}</b></div>:<div className="grid">{items.map(item=><article key={item.id}><span className="icon">{item.kind==='folder'?'📁':'📄'}</span><div className="itemText"><b>{item.name}</b><small>{item.kind==='folder'?'پوشه':bytes(item.size)}</small></div>{trashMode?<div className="rowActions"><button title="بازیابی" onClick={()=>onRestore?.(item)}>↩️</button><button title="حذف دائمی" onClick={()=>onDelete?.(item)}>❌</button></div>:<button className="more" onClick={()=>onMenu?.(item)}>⋮</button>}</article>)}</div>}</section>
}
function Profile(){return <section className="panel profile"><div className="avatar">👤</div><h2>حساب کاربری</h2><p>اطلاعات کاربر، فضای مصرفی و نشست‌های فعال در این صفحه مدیریت می‌شوند.</p><div className="formGrid"><label>نام نمایشی<input defaultValue={localStorage.getItem('storagebox.name')||''} onBlur={e=>localStorage.setItem('storagebox.name',e.target.value)}/></label><label>ایمیل<input type="email" defaultValue={localStorage.getItem('storagebox.email')||''} onBlur={e=>localStorage.setItem('storagebox.email',e.target.value)}/></label></div></section>}
function Settings({notify}:{notify:(x:string,t?:'ok'|'error')=>void}){const [url,setUrl]=useState(localStorage.getItem('storagebox.api')||'');const [token,setToken]=useState(localStorage.getItem('storagebox.token')||'');return <section className="panel"><h2>تنظیمات اتصال و برنامه</h2><div className="formGrid"><label>آدرس Backend<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.example.com"/></label><label>توکن ورود<input value={token} onChange={e=>setToken(e.target.value)} type="password" placeholder="JWT"/></label></div><div className="switchRow"><span><b>اعلان‌ها</b><small>نمایش اعلان وضعیت انتقال فایل</small></span><input type="checkbox" defaultChecked/></div><div className="switchRow"><span><b>حالت آفلاین PWA</b><small>کش رابط کاربری برای اجرای بدون اینترنت</small></span><input type="checkbox" defaultChecked disabled/></div><button className="primary" onClick={()=>{localStorage.setItem('storagebox.api',url.trim());localStorage.setItem('storagebox.token',token.trim());notify('تنظیمات ذخیره شد')}}>ذخیره تنظیمات</button></section>}
function About(){return <section className="panel about"><div className="logoBig">☁️</div><h2>AS StorageBox</h2><p>فضای ابری خصوصی برای نگهداری فایل، ساخت پوشه و اشتراک‌گذاری انتخابی فایل یا پوشه با افراد دیگر. هر کاربر فقط به محتوایی دسترسی دارد که مالک به‌طور مشخص با او به اشتراک گذاشته است.</p><hr/><b>راه‌های ارتباطی با ما:</b><p>AS.Developers.Support@Gmail.Com</p><hr/><p><b>نسخه:</b> 1.1.0 PWA</p><strong>Develop by AS Team Group</strong></section>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="modalWrap" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><h3>{title}</h3><button onClick={onClose}>✕</button></div>{children}</div></div>}
function PromptModal({title,placeholder,submit,onClose,onSubmit}:{title:string;placeholder:string;submit:string;onClose:()=>void;onSubmit:(v:string)=>void}){const [v,setV]=useState('');return <Modal title={title} onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSubmit(v)}}><input autoFocus className="wideInput" value={v} onChange={e=>setV(e.target.value)} placeholder={placeholder}/><button className="primary full" type="submit">{submit}</button></form></Modal>}

createRoot(document.getElementById('root')!).render(<App/>);
