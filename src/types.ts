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

export interface ChatSession {
  chatId: string;
  userId: string;
  title: string;
  mode: "chat";
  summarized?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Message {
  messageId: string;
  userId: string;
  role: ConversationRole;
  text: string;
  mapAction?: MapAction;
  searchSources?: Array<{
    title: string;
    url: string;
  }>;
  createdAt: any;
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

