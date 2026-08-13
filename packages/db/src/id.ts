import { v7 as uuidv7 } from 'uuid';

/** Application-generated UUID v7 (doc 05 §1: sorts by creation time, unlike v4). */
export function newId(): string {
  return uuidv7();
}
