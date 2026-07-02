import React from "react";
// @ts-nocheck
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Mic, MicOff, Smartphone, ArrowRight, BrainCircuit, Navigation, Calendar } from "lucide-react";
import type { Message } from "../types";
import { MessageItem } from "./MessageItem";
import { formatDateSeparator } from "../lib/date-utils";

const getMessageDate = (createdAt: any): Date | null => {
  if (!createdAt) return null;
  try {
    if (createdAt instanceof Date) {
      return createdAt;
    } else if (typeof createdAt === "string" || typeof createdAt === "number") {
      return new Date(createdAt);
    }
  } catch (e) {}
  return null;
};

const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};


interface ChatViewportProps {
  messages: Message[];
  loading: boolean;
  speechError: string | null;
  onClearSpeechError: () => void;
  handsFreeMode: boolean;
  onToggleHandsFree: () => void;
  inputText: string;
  onInputTextChange: (text: string) => void;
  isListening: boolean;
  onStartVoiceCapture: () => void;
  onStopVoiceCapture: () => void;
  onSendMessage: (text: string) => void;
  speakingMessageId: string | null;
  copiedId: string | null;
  onSpeak: (text: string, id: string) => void;
  onCopy: (text: string, id: string) => void;
  devScrollRef: React.RefObject<HTMLDivElement | null>;
}

const QUICK_PROMPTS = [
  { label: "Show quiet coffee shops near me" },
  { label: "Walking directions from Central Park to Times Square" },
  { label: "Find museums in London that are peaceful" },
  { label: "What is the history of Seattle Space Needle?" }
];

export const ChatViewport: React.FC<ChatViewportProps> = ({
  messages,
  loading,
  speechError,
  onClearSpeechError,
  handsFreeMode,
  onToggleHandsFree,
  inputText,
  onInputTextChange,
  isListening,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onSendMessage,
  speakingMessageId,
  copiedId,
  onSpeak,
  onCopy,
  devScrollRef
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between border border-zinc-900 rounded-2xl bg-zinc-950/40 p-4 min-h-[420px] overflow-hidden">
      
      {/* Messages Display */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[350px] scrollbar-thin scrollbar-thumb-zinc-800">
        
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 my-auto select-none">
            <BrainCircuit className="w-10 h-10 text-red-600 mb-3 animate-pulse" />
            <p className="text-sm text-white font-sans font-bold">Talker AI Assistant</p>
            <p className="text-[11px] text-zinc-400 mt-1 max-w-[280px] leading-relaxed">
              I am your friendly assistant. Speak or type! I can search locations, provide directions, and remember your preferences.
            </p>

            {/* Hands-free call to action */}
            <button 
              onClick={onToggleHandsFree}
              className="mt-5 px-4 py-2 rounded-xl bg-red-950/40 border border-red-500/20 hover:border-red-500/50 hover:bg-red-950/80 transition text-red-500 text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Mic className="w-4 h-4 text-red-500 animate-pulse" /> Start Hands-Free Mode
            </button>
          </div>
        )}

        {(() => {
          const elements: React.ReactNode[] = [];
          let lastDate: Date | null = null;

          messages.forEach((msg, index) => {
            const currentDate = getMessageDate(msg.createdAt);
            const showSeparator = currentDate && (!lastDate || !isSameDay(lastDate, currentDate));
            
            if (showSeparator) {
              const separatorText = formatDateSeparator(msg.createdAt);
              if (separatorText) {
                elements.push(
                  <div key={`sep-${msg.id || index}`} className="flex items-center justify-center my-5 select-none">
                    <div className="h-[1px] bg-gradient-to-r from-transparent via-zinc-800 to-transparent flex-1" />
                    <div className="mx-4 px-3.5 py-1.5 rounded-full bg-zinc-950 border border-zinc-900 shadow-sm flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono tracking-wider uppercase font-bold">
                      <Calendar className="w-3.5 h-3.5 text-red-500" />
                      <span>{separatorText}</span>
                    </div>
                    <div className="h-[1px] bg-gradient-to-r from-transparent via-zinc-800 to-transparent flex-1" />
                  </div>
                );
              }
            }

            elements.push(
              <MessageItem
                key={msg.id || index}
                msg={msg}
                index={index}
                speakingMessageId={speakingMessageId}
                copiedId={copiedId}
                onSpeak={onSpeak}
                onCopy={onCopy}
              />
            );

            if (currentDate) {
              lastDate = currentDate;
            }
          });

          return elements;
        })()}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono italic animate-pulse p-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '0s' }} />
              <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
            <span>Companion is thinking...</span>
          </div>
        )}

        {/* Speech / Input error states */}
        {speechError && (
          <div className="text-[10px] bg-red-950/60 border border-red-500/30 text-red-400 p-2.5 rounded-xl flex items-center justify-between">
            <span className="flex-1">{speechError}</span>
            <button onClick={onClearSpeechError} className="text-red-400 hover:text-red-300 font-bold ml-1">×</button>
          </div>
        )}

        <div ref={devScrollRef} />
      </div>

      {/* Input fields bar with dynamic speech indicators */}
      <div className="pt-3 border-t border-zinc-900 mt-2">
        
        {/* Hands-Free mode active warning bar */}
        <AnimatePresence>
          {handsFreeMode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-red-600 text-white font-bold text-[10px] tracking-wider rounded-xl py-1.5 px-3 mb-2 flex items-center justify-between border border-red-400/20 animate-pulse uppercase"
            >
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white animate-ping inline-block mr-1" />
                Hands-Free Active (Voice Loop)
              </span>
              <button 
                onClick={onToggleHandsFree}
                className="bg-zinc-950 text-red-500 font-sans border border-red-900/30 rounded-lg px-2 py-0.5 tracking-normal text-[9px] hover:text-white cursor-pointer transition uppercase font-semibold"
              >
                Mute
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Predefined prompt helpers for quick testing */}
        {messages.length === 0 && (
          <div className="mb-3.5 space-y-1.5 select-none">
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 font-sans">Quick Prompts:</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onInputTextChange(qp.label);
                    onSendMessage(qp.label);
                  }}
                  className="bg-zinc-900 border border-zinc-850 hover:border-red-900/40 text-zinc-400 hover:text-white text-[10px] px-2.5 py-1.5 rounded-xl transition cursor-pointer text-left truncate max-w-[260px]"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actual Chat form */}
        <div className="flex items-center gap-2">
          
          {/* Microphones trigger */}
          <button
            type="button"
            onClick={isListening ? onStopVoiceCapture : onStartVoiceCapture}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition border cursor-pointer relative ${
              isListening 
                ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30" 
                : "bg-zinc-900 border-zinc-800 text-red-500 hover:border-red-900/40 hover:text-red-400"
            }`}
            title="Speak phrase"
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                </span>
              </>
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => onInputTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onSendMessage(inputText);
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSendMessage(inputText);
                }
              }}
              placeholder={
                isListening 
                  ? "Listening closely..." 
                  : `Type your helper request...`
              }
              rows={1}
              className="w-full bg-zinc-900 focus:bg-zinc-900/90 border border-zinc-800 focus:border-red-500/50 rounded-xl py-3 pl-3.5 pr-12 text-xs text-white focus:outline-none transition leading-normal font-sans resize-none overflow-y-auto max-h-32"
              disabled={loading}
              onInput={(e) => {
                const target = e.currentTarget;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 128) + "px";
              }}
            />

            {/* Send Button */}
            <button
              onClick={() => onSendMessage(inputText)}
              disabled={loading || !inputText.trim()}
              className={`absolute right-1.5 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
                inputText.trim() 
                  ? "bg-red-600 text-white hover:bg-red-500" 
                  : "bg-zinc-950 border border-zinc-900 text-zinc-700"
              }`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hands free switch button */}
        <div className="flex items-center justify-between mt-2.5 px-1">
          <span className="text-[10px] text-zinc-500 font-sans flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-zinc-600" />
            <span>Voice recognition active</span>
          </span>

          <button 
            onClick={onToggleHandsFree}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
              handsFreeMode 
                ? "bg-red-950/20 border-red-500/40 text-red-400" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${handsFreeMode ? 'bg-red-500 animate-ping' : 'bg-zinc-600'}`} />
            <span>Hands-Free Auto-Listening</span>
          </button>
        </div>

      </div>

    </div>
  );
};