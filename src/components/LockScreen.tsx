import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Key, RefreshCw, AlertCircle, CheckCircle, Lock } from "lucide-react";
import { VOICE_PERSONALITIES, findBestNativeVoice } from "../lib/voice-utils";
import { ISpeechRecognitionEvent } from "../types";
import { Logo } from "./Logo";

interface LockScreenProps {
  pin: string;
  voicePassphrase: string;
  firstName: string;
  onUnlock: () => void;
  selectedVoiceId: string;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  pin,
  voicePassphrase,
  firstName,
  onUnlock,
  selectedVoiceId
}) => {
  const [loginMode, setLoginMode] = useState<"voice" | "pin">("voice");
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<boolean>(false);
  
  // Voice capture states
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSuccess, setVoiceSuccess] = useState<boolean>(false);
  const [heardText, setHeardText] = useState<string>("");
  
  const recognitionRef = useRef<any>(null);

  // Auto trigger voice recognition on load if mode is voice
  useEffect(() => {
    if (loginMode === "voice" && !voiceSuccess) {
      const timer = setTimeout(() => {
        startVoiceRecognition();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loginMode]);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const triggerWelcomeSpeech = () => {
    try {
      const welcomeText = `Welcome back, ${firstName || "friend"}.`;
      const utterance = new SpeechSynthesisUtterance(welcomeText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const personality = VOICE_PERSONALITIES.find(vp => vp.id === selectedVoiceId) || VOICE_PERSONALITIES[0];
      const bestVoice = findBestNativeVoice(
        personality.langCode,
        personality.gender.toLowerCase() as "male" | "female",
        personality.keywords,
        false
      );

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
      } else {
        utterance.lang = "en-US";
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Welcome speech issue:", err);
    }
  };

  const startVoiceRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Speech recognition not supported in this browser. Please use PIN code instead.");
      return;
    }

    if (isListening) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRecognition();
      recognitionRef.current = rec;
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
        setVoiceSuccess(false);
        setHeardText("");
      };

      rec.onresult = (event: ISpeechRecognitionEvent) => {
        const heard = event.results[0][0].transcript.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
        setHeardText(heard);

        const target = voicePassphrase.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();

        if (heard.includes(target) || target.includes(heard) || heard === target) {
          setVoiceSuccess(true);
          setIsListening(false);
          triggerWelcomeSpeech();
          setTimeout(() => {
            onUnlock();
          }, 1200);
        } else {
          setVoiceError(`Heard "${heard}", which does not match passphrase.`);
        }
      };

      rec.onerror = (err: { error: string }) => {
        console.error("Lockscreen speech recognition error:", err);
        if (err.error !== "aborted") {
          setVoiceError("Voice verification timed out or was blocked. Click mic to retry.");
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.start();
    } catch (err) {
      console.error("Failed to start voice recognition:", err);
      setIsListening(false);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 4) return;
    setPinError(false);
    const nextInput = pinInput + digit;
    setPinInput(nextInput);

    if (nextInput.length === 4) {
      if (nextInput === pin) {
        triggerWelcomeSpeech();
        setTimeout(() => {
          onUnlock();
        }, 500);
      } else {
        setPinError(true);
        setTimeout(() => {
          setPinInput("");
          setPinError(false);
        }, 1000);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(false);
  };

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Main red radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-600/15 rounded-full blur-[150px]" />
        
        {/* Secondary glows */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-zinc-900/30 rounded-full blur-[120px]" />
        
        {/* Vignette overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        
        {/* Geometric pattern - subtle diagonal lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="diagonal" patternUnits="userSpaceOnUse" width="100" height="100">
              <line x1="0" y1="100" x2="100" y2="0" stroke="#ff2d2d" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diagonal)" />
        </svg>

        {/* Neural network / circuit lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff2d2d" stopOpacity="0" />
              <stop offset="50%" stopColor="#ff2d2d" stopOpacity="1" />
              <stop offset="100%" stopColor="#ff2d2d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="20%" x2="100%" y2="20%" stroke="url(#lineGradient)" strokeWidth="0.5" />
          <line x1="0" y1="80%" x2="100%" y2="80%" stroke="url(#lineGradient)" strokeWidth="0.5" />
          <line x1="20%" y1="0" x2="20%" y2="100%" stroke="url(#lineGradient)" strokeWidth="0.5" />
          <line x1="80%" y1="0" x2="80%" y2="100%" stroke="url(#lineGradient)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-md flex flex-col items-center gap-10 relative z-10">
        
        {/* Header Branding */}
        <motion.div 
          className="flex flex-col items-center text-center gap-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <Logo size="xl" showText={true} variant="dark" />
          <p className="text-sm text-zinc-500 max-w-[320px] leading-relaxed mt-2">
            Private AI workspace with memory,<br />
            retrieval and intelligent tooling.
          </p>
        </motion.div>

        {/* Authentication Card */}
        <motion.div 
          className="w-full relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          {/* Card glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-red-600/20 via-red-600/10 to-red-600/20 rounded-[28px] blur-xl" />
          
          {/* Card container */}
          <div className="relative bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/50 rounded-[24px] p-8 shadow-2xl">
            
            <AnimatePresence mode="wait">
              {loginMode === "voice" ? (
                <motion.div
                  key="voice-panel"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  {/* Voice Print Label */}
                  <div className="flex items-center gap-2 text-red-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
                      Voice Print
                    </span>
                  </div>

                  {/* Microphone Button with Wave Animation */}
                  <div className="relative my-4">
                    {/* Sound wave visualization */}
                    {isListening && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-32 h-12 text-red-500/60" viewBox="0 0 120 40">
                          <motion.path
                            d="M 10 20 Q 15 10, 20 20 T 30 20 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20 T 110 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          />
                        </svg>
                      </div>
                    )}
                    
                    {/* Pulse rings when listening */}
                    {isListening && (
                      <>
                        <motion.div
                          className="absolute inset-0 bg-red-600/20 rounded-full"
                          animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <motion.div
                          className="absolute inset-0 bg-red-600/15 rounded-full"
                          animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                        />
                      </>
                    )}

                    {/* Main mic button */}
                    <button
                      onClick={startVoiceRecognition}
                      disabled={voiceSuccess}
                      className={`relative w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all duration-300 cursor-pointer ${
                        voiceSuccess
                          ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-400"
                          : isListening
                          ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/30"
                          : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                      }`}
                    >
                      {voiceSuccess ? (
                        <CheckCircle className="w-10 h-10" />
                      ) : (
                        <Mic className="w-10 h-10" />
                      )}
                    </button>
                  </div>

                  {/* Status Messages */}
                  <div className="min-h-[80px] flex flex-col justify-center px-4">
                    {voiceSuccess ? (
                      <motion.p 
                        className="text-sm text-emerald-400 font-semibold leading-relaxed"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        Voice matched perfectly! Welcome back.
                      </motion.p>
                    ) : isListening ? (
                      <div className="space-y-2">
                        <p className="text-sm text-zinc-300 font-semibold">
                          Listening...
                        </p>
                        <p className="text-xs text-zinc-500 italic max-w-[240px] mx-auto">
                          "{voicePassphrase}"
                        </p>
                      </div>
                    ) : voiceError ? (
                      <div className="flex flex-col items-center gap-2 text-red-400">
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <AlertCircle className="w-4 h-4" />
                          <span>Voice not recognized</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 max-w-[260px] leading-relaxed">
                          {voiceError}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-[260px] mx-auto">
                        Click the microphone and speak your passphrase to unlock
                      </p>
                    )}
                  </div>

                  {/* Retry Button */}
                  {!isListening && !voiceSuccess && (
                    <button
                      onClick={startVoiceRecognition}
                      className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Try voice recognition again</span>
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="pin-panel"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-6"
                >
                  {/* PIN Label */}
                  <div className="flex items-center gap-2 text-red-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
                      Security PIN
                    </span>
                  </div>

                  {/* PIN dots display */}
                  <div className={`flex gap-4 my-2 ${pinError ? "animate-shake" : ""}`} aria-hidden="true">
                    {[0, 1, 2, 3].map((idx) => {
                      const active = pinInput.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
                            pinError
                              ? "bg-red-500 border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                              : active
                                ? "bg-red-600 border-red-500 shadow-[0_0_12px_rgba(220,38,38,0.3)]"
                                : "border-zinc-700 bg-black"
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Error message */}
                  <div className="min-h-[16px] text-center">
                    {pinError && (
                      <span className="text-[11px] text-red-400 font-bold flex items-center gap-1.5 justify-center">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Please try again
                      </span>
                    )}
                  </div>

                  {/* Number pad keyboard */}
                  <div className="grid grid-cols-3 gap-x-5 gap-y-3 w-full max-w-[240px]">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handlePinDigit(digit)}
                        className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-100 font-bold text-sm transition cursor-pointer flex items-center justify-center active:scale-95"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPinInput("")}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer uppercase tracking-wider flex items-center justify-center"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePinDigit("0")}
                      className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-100 font-bold text-sm transition cursor-pointer flex items-center justify-center active:scale-95"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handlePinBackspace}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer uppercase tracking-wider flex items-center justify-center"
                    >
                      Back
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </motion.div>

        {/* Segmented Control */}
        <motion.div 
          className="flex items-center gap-2 w-full bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/50 p-1.5 rounded-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        >
          <button
            onClick={() => {
              setLoginMode("voice");
              setPinInput("");
              setPinError(false);
            }}
            className={`flex-1 py-3 rounded-xl text-center font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              loginMode === "voice"
                ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Print</span>
          </button>
          
          <button
            onClick={() => {
              setLoginMode("pin");
              if (recognitionRef.current) {
                recognitionRef.current.abort();
              }
              setIsListening(false);
            }}
            className={`flex-1 py-3 rounded-xl text-center font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              loginMode === "pin"
                ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Security PIN</span>
          </button>
        </motion.div>

      </div>
    </div>
  );
};