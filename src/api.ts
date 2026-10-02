export interface Credentials { apiUrl: string; idInstance: string; apiTokenInstance: string }
export const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный ответ GREEN-API.');
  return value as Record<string, unknown>;
};
export function normalizePhone(input: string): string {
  if (!/^\+?[\d ()-]+$/.test(input.trim())) throw new Error('Введите номер телефона с кодом страны.');
  const digits = input.replace(/\D/g, '');
  if (!/^[1-9]\d{6,14}$/.test(digits)) throw new Error('Номер должен содержать от 7 до 15 цифр с кодом страны.');
  return digits;
}
export function validateCredentials(value: Credentials): Credentials {
  const url = new URL(value.apiUrl);
  if (url.protocol !== 'https:' || !/^(?:\d+\.)?api\.green-api\.com$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Используйте apiUrl из кабинета GREEN-API, например https://4100.api.green-api.com.');
  if (!/^\d+$/.test(value.idInstance) || !/^[a-zA-Z0-9_-]+$/.test(value.apiTokenInstance)) throw new Error('Проверьте idInstance и apiTokenInstance.');
  return {...value, apiUrl: url.origin};
}
export class GreenApi {
  constructor(readonly credentials: Credentials) { validateCredentials(credentials); }
  async call(method: string, verb: 'GET' | 'POST' | 'DELETE', signal: AbortSignal, body?: unknown, suffix = ''): Promise<unknown> {
    const c = this.credentials;
    const timeout = AbortSignal.timeout(70000);
    let response: Response;
    try {
      response = await fetch(`${c.apiUrl}/waInstance${c.idInstance}/${method}/${c.apiTokenInstance}${suffix}`, {
        method: verb, signal: AbortSignal.any([signal, timeout]), referrerPolicy: 'no-referrer',
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
      });
    } catch {
      if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
      throw new Error('Нет ответа от GREEN-API. Проверьте сеть и apiUrl.');
    }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Доступ отклонён. Проверьте учётные данные и тариф.' : `GREEN-API: ошибка HTTP ${response.status}. Проверьте настройки инстанса.`);
    try { return await response.json(); } catch { throw new Error('Некорректный ответ GREEN-API.'); }
  }
  async authorize(signal: AbortSignal) {
    const data = object(await this.call('getStateInstance', 'GET', signal));
    if (data.stateInstance !== 'authorized') throw new Error('Авторизуйте Telegram-инстанс в кабинете GREEN-API.');
  }
  async contact(phone: string, signal: AbortSignal) {
    const data = object(await this.call('getContactInfo', 'POST', signal, {chatId: `${phone}@c.us`}));
    if (typeof data.chatId !== 'string' || !/^\d+$/.test(data.chatId)) throw new Error('Не удалось определить Telegram ID получателя.');
    return {id: data.chatId, title: typeof data.name === 'string' && data.name ? data.name : `+${phone}`, phone};
  }
  async send(chatId: string, message: string, signal: AbortSignal) {
    if (!message.trim() || message.length > 4096) throw new Error('Сообщение должно содержать от 1 до 4096 символов.');
    const data = object(await this.call('sendMessage', 'POST', signal, {chatId, message}));
    if (typeof data.idMessage !== 'string') throw new Error('Статус отправки неизвестен. Проверьте Telegram перед повтором.');
    return data.idMessage;
  }
  async receive(signal: AbortSignal) {
    const data = await this.call('receiveNotification', 'GET', signal, undefined, '?receiveTimeout=5');
    if (data === null) return null;
    const envelope = object(data);
    if (!Number.isSafeInteger(envelope.receiptId) || Number(envelope.receiptId) < 0) throw new Error('Некорректный receiptId. Получение остановлено.');
    return {receiptId: Number(envelope.receiptId), body: object(envelope.body)};
  }
  async acknowledge(receiptId: number, signal: AbortSignal) {
    const data = object(await this.call('deleteNotification', 'DELETE', signal, undefined, `/${receiptId}`));
    if (data.result !== true) throw new Error('Не удалось подтвердить уведомление. Получение остановлено; повторите подключение.');
  }
}
