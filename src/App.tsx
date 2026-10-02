import {useEffect, useRef, useState, type FormEvent} from 'react';
import {GreenApi, normalizePhone, validateCredentials} from './api';
import {mergeMessage, parseEvent, type Chat, type Message} from './messages';
import './styles.css';
const statusLabel: Record<string,string> = {queued:'В очереди',sent:'Отправлено',delivered:'Доставлено',read:'Прочитано',failed:'Не доставлено',noAccount:'Нет аккаунта'};
export function App() {
  const [api,setApi] = useState<GreenApi|null>(null);
  const [apiUrl,setApiUrl] = useState('https://4100.api.green-api.com');
  const [id,setId] = useState(''); const [token,setToken] = useState('');
  const [connecting,setConnecting] = useState(false); const [loginError,setLoginError] = useState('');
  const [chats,setChats] = useState<Chat[]>([]); const [selected,setSelected] = useState<string|null>(null);
  const [messages,setMessages] = useState<Message[]>([]); const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [phone,setPhone] = useState(''); const [adding,setAdding] = useState(false); const [sending,setSending] = useState(false);
  const [error,setError] = useState(''); const [receiving,setReceiving] = useState(''); const [retry,setRetry] = useState(0);
  const [online,setOnline] = useState(navigator.onLine);
  const session = useRef(new AbortController()); const end = useRef<HTMLDivElement>(null); const compose = useRef<HTMLTextAreaElement>(null);
  const current = chats.find(chat=>chat.id===selected); const draft = selected ? drafts[selected] ?? '' : '';
  useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false); window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);session.current.abort();};},[]);
  useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[messages,selected]);
  useEffect(()=>{if(selected) compose.current?.focus();},[selected]);
  useEffect(()=>{
    if(!api || !online) return;
    const controller = new AbortController(); let stopped=false;
    async function poll() {
      setReceiving('Получение подключено');
      while(!stopped) {
        try {
          const notification = await api!.receive(controller.signal);
          if(stopped) return;
          if(notification) {
            const event=parseEvent(notification.body);
            if(event.kind==='message') {
              setChats(old=>old.some(chat=>chat.id===event.chat.id)?old:[...old,event.chat]);
              setMessages(old=>mergeMessage(old,event.message));
            } else if(event.kind==='status') {
              setMessages(old=>old.map(message=>message.id===event.id&&message.chatId===event.chatId?{...message,status:event.status}:message));
            }
            // Acknowledge only after validation and processing; duplicates are harmless.
            await api!.acknowledge(notification.receiptId,controller.signal);
          }
          await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,300);controller.signal.addEventListener('abort',done,{once:true});});
        } catch(e) {
          if(stopped) return;
          setReceiving(e instanceof Error?e.message:'Получение остановлено.'); return;
        }
      }
    }
    void poll(); return()=>{stopped=true;controller.abort();};
  },[api,online,retry]);
  async function login(event:FormEvent) {
    event.preventDefault();setLoginError('');setConnecting(true);
    try {const client=new GreenApi(validateCredentials({apiUrl:apiUrl.trim(),idInstance:id.trim(),apiTokenInstance:token.trim()})); await client.authorize(session.current.signal);setToken('');setApi(client);}
    catch(e){setLoginError(e instanceof Error?e.message:'Не удалось подключиться.');}finally{setConnecting(false);}
  }
  function logout(){session.current.abort();session.current=new AbortController();setApi(null);setToken('');setChats([]);setMessages([]);setDrafts({});setSelected(null);setError('');setPhone('');setAdding(false);setSending(false);}
  async function add(event:FormEvent){event.preventDefault();if(!api || adding)return;const signal=session.current.signal;setError('');setAdding(true);try{const chat=await api.contact(normalizePhone(phone),signal);if(signal.aborted)return;setChats(old=>old.some(item=>item.id===chat.id)?old:[...old,chat]);setSelected(chat.id);setPhone('');}catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:'Не удалось создать чат.');}finally{if(!signal.aborted)setAdding(false);}}
  async function send(event?:FormEvent){event?.preventDefault();if(!api||!selected||sending||!draft.trim()||!online)return;const chatId=selected,text=draft,signal=session.current.signal;setSending(true);setError('');try{const messageId=await api.send(chatId,text,signal);if(signal.aborted)return;setMessages(old=>mergeMessage(old,{id:messageId,chatId,text,timestamp:Date.now()/1000,direction:'out',status:'queued'}));setDrafts(old=>old[chatId]===text?{...old,[chatId]:''}:old);}catch(e){if(!signal.aborted)setError(`${e instanceof Error?e.message:'Ошибка отправки.'} Черновик сохранён. При сетевом сбое проверьте Telegram перед повтором: сообщение могло попасть в очередь.`);}finally{if(!signal.aborted)setSending(false);}}
  if(!api) return <main className="login"><form className="login-card" onSubmit={login}><div className="logo" aria-hidden="true">➤</div><h1>Telegram</h1><p className="muted">Текстовые сообщения через GREEN-API</p><label>apiUrl<input required type="url" value={apiUrl} onChange={e=>setApiUrl(e.target.value)} autoComplete="off"/></label><label>idInstance<input required inputMode="numeric" value={id} onChange={e=>setId(e.target.value)} autoComplete="off"/></label><label>apiTokenInstance<input required type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label><p className="note">Возьмите данные авторизованного Telegram-инстанса в кабинете GREEN-API. Токен и переписка хранятся только в памяти вкладки.</p>{loginError&&<p role="alert" className="error">{loginError}</p>}<button className="primary" disabled={connecting||!online}>{connecting?'Подключение…':'Подключиться'}</button>{!online&&<p role="status">Нет подключения к интернету</p>}</form></main>;
  return <main className={`app ${selected?'chat-open':''}`}><aside className="sidebar" aria-label="Чаты"><header><div className="brand"><span className="logo small" aria-hidden="true">➤</span><strong>Telegram</strong></div><button onClick={logout}>Выйти</button></header><form className="new-chat" onSubmit={add}><label htmlFor="phone">Новый чат</label><div className="row"><input id="phone" type="tel" placeholder="Номер с кодом страны" value={phone} onChange={e=>setPhone(e.target.value)} required/><button className="primary" disabled={adding||!online} aria-label="Создать чат">{adding?'…':'+'}</button></div></form><nav className="chat-list" aria-label="Список чатов">{chats.length===0?<p className="muted empty-list">Создайте чат по номеру телефона, чтобы начать переписку.</p>:chats.map(chat=>{const last=messages.filter(m=>m.chatId===chat.id).at(-1);return <button className={`chat-item ${selected===chat.id?'selected':''}`} aria-pressed={selected===chat.id} key={chat.id} onClick={()=>{setSelected(chat.id);setError('');}}><span className="avatar" aria-hidden="true">{chat.title[0]?.toUpperCase()}</span><span><strong>{chat.title}</strong><span className="preview">{last?.text??(chat.phone?`+${chat.phone}`:'Нет сообщений')}</span></span></button>;})}</nav><footer><div role="status">{online?receiving:'Нет сети. Получение приостановлено.'}</div><button onClick={()=>setRetry(v=>v+1)} disabled={!online}>Возобновить получение</button></footer></aside><section className="conversation" aria-label="Переписка">{current?<><header className="chat-header"><button className="back" onClick={()=>setSelected(null)} aria-label="Вернуться к чатам">←</button><span className="avatar" aria-hidden="true">{current.title[0]?.toUpperCase()}</span><div><h1>{current.title}</h1><p className="muted">{current.phone?`+${current.phone}`:'Telegram'}</p></div></header><div className="connection" role="status">{online?receiving:'Нет сети. Черновик доступен; отправка и получение приостановлены.'}<button onClick={()=>setRetry(v=>v+1)} disabled={!online}>Возобновить получение</button></div><div className="messages" role="log" aria-label="Сообщения" aria-live="polite">{messages.filter(m=>m.chatId===current.id).length===0&&<div className="empty-chat"><h2>Начните разговор</h2><p>Напишите первое текстовое сообщение.</p></div>}{messages.filter(m=>m.chatId===current.id).map(m=><article className={`bubble ${m.direction}`} key={`${m.chatId}:${m.id}`}><p dir="auto">{m.text}</p><div className="meta"><time dateTime={new Date(m.timestamp*1000).toISOString()}>{new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(m.timestamp*1000)}</time>{m.direction==='out'&&<span>{statusLabel[m.status]??'Статус неизвестен'}</span>}</div></article>)}<div ref={end}/></div><form className="composer" onSubmit={send}><label className="sr-only" htmlFor="message">Сообщение</label><textarea ref={compose} id="message" placeholder="Сообщение" value={draft} maxLength={4096} rows={2} onChange={e=>setDrafts(old=>({...old,[current.id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button className="primary send" disabled={sending||!online||!draft.trim()} aria-label="Отправить сообщение">{sending?'…':'➤'}</button><small>Enter — отправить · Shift+Enter — новая строка · {draft.length}/4096</small></form></>:<div className="welcome"><span className="logo" aria-hidden="true">➤</span><h1>Ваши сообщения — здесь</h1><p>Создайте чат или выберите его в списке.</p><p className="muted">Только текст. Без лишних функций.</p></div>}</section>{error&&<div className="global-error" role="alert">{error}<button aria-label="Закрыть ошибку" onClick={()=>setError('')}>×</button></div>}</main>;
}

