import {describe,it,expect,vi} from 'vitest';
import {GreenApi,normalizePhone,validateCredentials} from '../src/api';
import {mergeMessage,parseEvent} from '../src/messages';
const credentials={apiUrl:'https://4100.api.green-api.com',idInstance:'4100000000',apiTokenInstance:'test-token'};
const body={typeWebhook:'incomingMessageReceived',timestamp:1763115112,idMessage:'1',senderData:{chatId:'10000000',chatName:'Тест'},messageData:{typeMessage:'textMessage',textMessageData:{textMessage:'Привет <script>'}}};
describe('Phone and credentials',()=>{
 it('normalizes international phones without assuming Russia',()=>{expect(normalizePhone('+44 (7700) 900-123')).toBe('447700900123');expect(()=>normalizePhone('abc79998887766')).toThrow();expect(()=>normalizePhone('123')).toThrow();});
 it('prevents credentials being sent to arbitrary hosts',()=>{expect(validateCredentials(credentials).apiUrl).toBe(credentials.apiUrl);for(const apiUrl of ['http://4100.api.green-api.com','https://api.green-api.com.evil.com','https://evil.com','https://api.green-api.com/path'])expect(()=>validateCredentials({...credentials,apiUrl})).toThrow();});
});
describe('Notifications',()=>{
 it('preserves text and resolves Telegram numeric chat IDs',()=>{const event=parseEvent(body);expect(event.kind).toBe('message');if(event.kind==='message'){expect(event.message.text).toBe('Привет <script>');expect(event.chat.id).toBe('10000000');expect(mergeMessage([event.message],event.message)).toHaveLength(1);expect(mergeMessage([event.message],{...event.message,chatId:'other'})).toHaveLength(2);}});
 it('rejects malformed text rather than acknowledging it',()=>{expect(()=>parseEvent({...body,idMessage:undefined})).toThrow();expect(()=>parseEvent({...body,timestamp:1e100})).toThrow();});
 it('handles URL text and ignores media',()=>{expect(parseEvent({...body,messageData:{typeMessage:'extendedTextMessage',extendedTextMessageData:{text:'https://example.com'}}}).kind).toBe('message');expect(parseEvent({...body,messageData:{typeMessage:'imageMessage'}}).kind).toBe('ignored');});
});
describe('GREEN-API contract',()=>{
 it('sends text with correct endpoint and payload',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({idMessage:'123'})));try{expect(await new GreenApi(credentials).send('10000000','Привет',new AbortController().signal)).toBe('123');expect(fetch.mock.calls[0][0]).toBe('https://4100.api.green-api.com/waInstance4100000000/sendMessage/test-token');expect(fetch.mock.calls[0][1]?.body).toBe(JSON.stringify({chatId:'10000000',message:'Привет'}));}finally{fetch.mockRestore();}});
 it('does not expose token in network errors or retry sends',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('secret URL'));try{await expect(new GreenApi(credentials).send('1','Text',new AbortController().signal)).rejects.toThrow('Нет ответа');expect(fetch).toHaveBeenCalledTimes(1);}finally{fetch.mockRestore();}});
 it('validates receive envelope and acknowledgement',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({receiptId:123,body}))).mockResolvedValueOnce(new Response(JSON.stringify({result:false})));try{const api=new GreenApi(credentials),signal=new AbortController().signal;expect((await api.receive(signal))?.receiptId).toBe(123);await expect(api.acknowledge(123,signal)).rejects.toThrow();expect(fetch.mock.calls[1][1]?.method).toBe('DELETE');}finally{fetch.mockRestore();}});
});
