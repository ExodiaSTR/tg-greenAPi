import {object} from './api';
export interface Message {id: string; chatId: string; text: string; timestamp: number; direction: 'in' | 'out'; status: string}
export interface Chat {id: string; title: string; phone?: string}
export type Event = {kind: 'message'; message: Message; chat: Chat} | {kind: 'status'; id: string; chatId: string; status: string} | {kind: 'ignored'};
export function parseEvent(body: Record<string, unknown>): Event {
  if (body.typeWebhook === 'outgoingMessageStatus') {
    if (typeof body.idMessage !== 'string' || typeof body.chatId !== 'string' || typeof body.status !== 'string') throw new Error('Некорректный статус сообщения.');
    return {kind:'status', id:body.idMessage, chatId:body.chatId, status:body.status};
  }
  if (!['incomingMessageReceived','outgoingAPIMessageReceived','outgoingMessageReceived'].includes(String(body.typeWebhook))) return {kind:'ignored'};
  const data = object(body.messageData);
  if (!['textMessage','extendedTextMessage'].includes(String(data.typeMessage))) return {kind:'ignored'};
  const text = data.typeMessage === 'textMessage' ? object(data.textMessageData).textMessage : object(data.extendedTextMessageData).text;
  const sender = object(body.senderData);
  if (typeof text !== 'string' || typeof sender.chatId !== 'string' || typeof body.idMessage !== 'string' || typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp) || !Number.isFinite(new Date(body.timestamp * 1000).getTime())) throw new Error('Некорректное текстовое уведомление. Оно оставлено в очереди.');
  return {kind:'message', chat:{id:sender.chatId,title:typeof sender.chatName === 'string' && sender.chatName ? sender.chatName : sender.chatId}, message:{id:body.idMessage,chatId:sender.chatId,text,timestamp:body.timestamp,direction:body.typeWebhook === 'incomingMessageReceived' ? 'in' : 'out',status:body.typeWebhook === 'incomingMessageReceived' ? '' : 'sent'}};
}
export function mergeMessage(messages: Message[], message: Message): Message[] {
  if (messages.some(item => item.id === message.id && item.chatId === message.chatId)) return messages;
  return [...messages,message].sort((a,b)=>a.timestamp-b.timestamp);
}
