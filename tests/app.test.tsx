// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from '../src/App';
beforeEach(()=>{Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function server(options:{sendFailure?:boolean;contactFailure?:boolean;pollFailure?:boolean}={}){
 let received=false;
 return vi.spyOn(globalThis,'fetch').mockImplementation(async (url,init)=>{
  const path=String(url);
  if(path.includes('/getStateInstance/'))return new Response(JSON.stringify({stateInstance:'authorized'}));
  if(path.includes('/getContactInfo/'))return options.contactFailure?new Response('{}',{status:400}):new Response(JSON.stringify({chatId:'10000000',name:'Получатель'}));
  if(path.includes('/sendMessage/'))return options.sendFailure?new Response('{}',{status:500}):new Response(JSON.stringify({idMessage:'out1'}));
  if(path.includes('/deleteNotification/'))return new Response(JSON.stringify({result:true}));
  if(path.includes('/receiveNotification/')){
   if(options.pollFailure)return new Response('{}',{status:403});
   if(received)return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
   received=true;return new Response(JSON.stringify({receiptId:42,body:{typeWebhook:'incomingMessageReceived',idMessage:'in1',timestamp:1763115112,senderData:{chatId:'10000000',chatName:'Получатель'},messageData:{typeMessage:'textMessage',textMessageData:{textMessage:'Ответ из Telegram'}}}}));
  }
  throw new Error('Unexpected endpoint');
 });
}
async function login(){const user=userEvent.setup();render(<App/>);await user.type(screen.getByLabelText('idInstance'),'4100000000');await user.type(screen.getByLabelText('apiTokenInstance'),'test-token');await user.click(screen.getByRole('button',{name:'Подключиться'}));await screen.findByRole('button',{name:'Выйти'});return user;}
it('completes login, phone resolution, incoming and outgoing text',async()=>{const fetch=server(),user=await login();await user.type(screen.getByLabelText('Новый чат'),'+79998887766');await user.click(screen.getByRole('button',{name:'Создать чат'}));await screen.findByRole('heading',{name:'Получатель'});expect(await screen.findAllByText('Ответ из Telegram')).toHaveLength(2);await user.type(screen.getByLabelText('Сообщение'),'Привет');await user.click(screen.getByRole('button',{name:'Отправить сообщение'}));expect(await screen.findByText('В очереди')).toBeTruthy();expect((screen.getByLabelText('Сообщение') as HTMLTextAreaElement).value).toBe('');await waitFor(()=>expect(fetch.mock.calls.some(call=>String(call[0]).includes('/deleteNotification/'))).toBe(true));await user.click(screen.getByRole('button',{name:'Выйти'}));expect(screen.queryAllByText('Ответ из Telegram')).toHaveLength(0);expect((screen.getByLabelText('apiTokenInstance') as HTMLInputElement).value).toBe('');});
it('preserves the draft and exposes send failure',async()=>{server({sendFailure:true});const user=await login();await user.click(await screen.findByRole('button',{name:/Получатель/}));await user.type(screen.getByLabelText('Сообщение'),'Не потеряй');await user.click(screen.getByRole('button',{name:'Отправить сообщение'}));expect(await screen.findByRole('alert')).toBeTruthy();expect((screen.getByLabelText('Сообщение') as HTMLTextAreaElement).value).toBe('Не потеряй');expect(screen.queryByText('В очереди')).toBeNull();});
it('exposes polling and phone errors before choosing a chat',async()=>{server({pollFailure:true,contactFailure:true});const user=await login();expect(await screen.findByText(/Доступ отклонён/)).toBeTruthy();await user.type(screen.getByLabelText('Новый чат'),'123');await user.click(screen.getByRole('button',{name:'Создать чат'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Возобновить получение'})).toBeTruthy();});
it('does not restore old-account chats after logout during contact lookup',async()=>{
 const fetch=server({pollFailure:true});const user=await login();let resolveContact:(value:Response)=>void=()=>{};
 fetch.mockImplementationOnce(()=>new Promise(resolve=>{resolveContact=resolve;}));
 await user.type(screen.getByLabelText('Новый чат'),'+79998887766');await user.click(screen.getByRole('button',{name:'Создать чат'}));await user.click(screen.getByRole('button',{name:'Выйти'}));
 resolveContact(new Response(JSON.stringify({chatId:'20000000',name:'Старый аккаунт'})));
 await waitFor(()=>expect(screen.queryByText('Старый аккаунт')).toBeNull());expect(screen.getByRole('button',{name:'Подключиться'})).toBeTruthy();await user.type(screen.getByLabelText('apiTokenInstance'),'second-token');await user.click(screen.getByRole('button',{name:'Подключиться'}));await screen.findByRole('button',{name:'Выйти'});expect(screen.queryByRole('button',{name:/Старый аккаунт/})).toBeNull();
});
