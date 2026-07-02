/**
 * Client-side TypeScript type definitions for Talker AI.
 *
 * Re-exports shared domain types (Persona, MapAction, ConversationRole)
 * from `shared/types.ts` and declares client-only types (Firestore entities,
 * Web Speech API interfaces, etc.).
 */

import type {
  Persona,
  MapAction,
  ConversationRole,
} from "../shared/types";

// Re-export shared types so existing import paths keep working.
export type { Persona, MapAction, ConversationRole };

/**
 * Firestore user profile document.
 * Extends Persona to inherit the shared personality/preferences fields.
 */
export interface UserProfile extends Persona {
  userId: string;
  email: string;
  displayName: string;
  createdAt: any;
  updatedAt: any;
}

/**
 * Full persona record as stored and edited in the settings form.
 * All fields required — the form initialises with empty strings.
 */
export type UserPersona = Required<Persona>;

export interface SecurityConfig {
  securityEnabled: boolean;
  pin: string;
  voicePassphrase: string;
  firstName: string;
}

/**
 * A conversation as returned by the backend API.
 * Maps from the server's Conversation type.
 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A message as returned by the backend API.
 * Maps from the server's Message type.
 */
export interface Message {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

// Global window extensions for Web Speech API standard interfaces
export interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

export interface ISpeechRecognitionError {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}