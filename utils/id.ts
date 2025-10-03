import { v4 as uuidv4 } from 'uuid';

export function createID(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function createGameCode(): string {
    return createID(6).toUpperCase();
}

export function createGameToken(): string {
    return uuidv4();
}