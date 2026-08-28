import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const files=[['📁','اسناد','۱۲ فایل'],['📁','تصاویر پروژه','۸ فایل'],['📄','قرارداد.pdf','2.4 MB'],['📊','لیست قیمت.xlsx','640 KB']];
function App(){return <div className="app"><aside><div className="brand">☁️ <b>AS StorageBox</b></div><nav><button className="active">📂 فایل‌های من</button><button>👥 اشتراک‌گذاری شده</button><button>🗑️ سطل زباله</button><button>👤 حساب کاربری</button></nav><footer>گروه توسعه فناوری و نرم افزاری as Team</footer></aside><main><header><div><h1>فایل‌های من</h1><p>فضای ابری خصوصی شما</p></div><button className="primary">＋ افزودن</button></header><section className="quota"><div><b>فضای ذخیره‌سازی</b><span>۱۸۰ مگابایت از ۱ گیگابایت</span></div><progress value="18" max="100"/></section><section><div className="sectionHead"><h2>فایل‌ها و پوشه‌ها</h2><input placeholder="جستجو…"/></div><div className="grid">{files.map(([icon,name,size])=><article key={name}><span className="icon">{icon}</span><div><b>{name}</b><small>{size}</small></div><button>⋮</button></article>)}</div></section></main></div>}
createRoot(document.getElementById('root')!).render(<App/>);
