import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Unlock, Mic, Key, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { VOICE_PERSONALITIES, findBestNativeVoice } from "../lib/voice-utils";
import { ISpeechRecognitionEvent } from "../types";

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
      // Small timeout to allow render completion
      const timer = setTimeout(() => {
        startVoiceRecognition();
      }, 600);
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
          // Unlock after brief delay for gorgeous visual confirmation
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
        // Play error sound/shake, clear input after 800ms
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
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-4">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-900/40 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm flex flex-col items-center gap-8 relative z-10">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-1 text-red-500 shadow-xl shadow-red-500/5">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Talker Workspace Locked</h2>
          <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
            Startup authentication is active. Identify yourself to access your personal companion.
          </p>
        </div>

        {/* Dynamic Panel Container */}
        <div className="w-full bg-zinc-950 border border-zinc-900 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 relative min-h-[340px] justify-center">
          
          <AnimatePresence mode="wait">
            {loginMode === "voice" ? (
              <motion.div
                key="voice-panel"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-5 text-center py-4"
              >
                <div className="text-[10px] text-red-400 font-mono font-bold uppercase tracking-wider bg-red-950/20 px-3 py-1.5 rounded-full border border-red-900/20">
                  Voice Signature Login
                </div>

                {/* Pulsing Mic Wave */}
                <div className="relative my-2">
                  {isListening && (
                    <>
                      <span className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
                      <span className="absolute -inset-2 bg-red-500/10 rounded-full animate-pulse" />
                    </>
                  )}
                  <button
                    onClick={startVoiceRecognition}
                    disabled={voiceSuccess}
                    className={`w-20 h-20 rounded-full border flex items-center justify-center transition duration-200 cursor-pointer ${
                      voiceSuccess
                        ? "bg-emerald-950/40 border-emerald-500 text-emerald-400"
                        : isListening
                        ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/25"
                        : "bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    {voiceSuccess ? (
                      <CheckCircle className="w-8 h-8" />
                    ) : (
                      <Mic className="w-8 h-8" />
                    )}
                  </button>
                </div>

                {/* Subtitle status lines */}
                <div className="min-h-[64px] flex flex-col justify-center px-4">
                  {voiceSuccess ? (
                    <p className="text-xs text-emerald-400 font-bold leading-relaxed">
                      Voice matched perfectly! Welcome back.
                    </p>
                  ) : isListening ? (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-300 font-semibold leading-none">
                        Speak clearly now...
                      </p>
                      <p className="text-[11px] text-zinc-500 italic max-w-[220px] mx-auto truncate">
                        "{voicePassphrase}"
                      </p>
                    </div>
                  ) : voiceError ? (
                    <div className="flex flex-col items-center gap-1.5 text-red-400">
                      <div className="flex items-center gap-1 text-[11px] font-bold">
                        <AlertCircle className="w-3.5 h-3.5" /> Identity Mismatch
                      </div>
                      <p className="text-[10px] text-zinc-500 max-w-[240px] leading-relaxed">
                        {voiceError}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px] mx-auto">
                      Click the button above and speak your keyphrase to log in.
                    </p>
                  )}
                </div>

                {/* Trigger Mic Manual Retry */}
                {!isListening && !voiceSuccess && (
                  <button
                    onClick={startVoiceRecognition}
                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Try voice recognition again</span>
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="pin-panel"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="text-[10px] text-red-400 font-mono font-bold uppercase tracking-wider bg-red-950/20 px-3 py-1.5 rounded-full border border-red-900/20">
                  Enter 4-Digit Security PIN
                </div>

                {/* PIN dots display */}
                <div className={`flex gap-5 my-2 ${pinError ? "animate-shake" : ""}`}>
                  {[0, 1, 2, 3].map((idx) => {
                    const active = pinInput.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-3.5 h-3.5 rounded-full border transition duration-150 ${
                          pinError
                            ? "bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                            : active
                            ? "bg-red-600 border-red-500 shadow-[0_0_8px_rgba(220,38,38,0.25)]"
                            : "border-zinc-850 bg-black"
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Subtitle feedback for pin */}
                <div className="min-h-[16px] text-center">
                  {pinError && (
                    <span className="text-[11px] text-red-400 font-bold flex items-center gap-1 justify-center">
                      <AlertCircle className="w-3.5 h-3.5" /> Incorrect security PIN.
                    </span>
                  )}
                </div>

                {/* Number pad keyboard */}
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 w-full max-w-[230px]">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handlePinDigit(digit)}
                      className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-100 font-bold text-sm transition cursor-pointer flex items-center justify-center active:scale-95"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPinInput("")}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer uppercase font-sans flex items-center justify-center"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinDigit("0")}
                    className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-100 font-bold text-sm transition cursor-pointer flex items-center justify-center active:scale-95"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer uppercase font-sans flex items-center justify-center"
                  >
                    Back
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Toggle Mode Footer Switch */}
        <div className="flex items-center gap-3 w-full justify-between bg-zinc-950 border border-zinc-900/60 p-2.5 rounded-2xl">
          <button
            onClick={() => {
              setLoginMode("voice");
              setPinInput("");
              setPinError(false);
            }}
            className={`flex-1 py-2 rounded-xl text-center font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === "voice"
                ? "bg-red-600 text-white"
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
            className={`flex-1 py-2 rounded-xl text-center font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === "pin"
                ? "bg-red-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Security PIN</span>
          </button>
        </div>

      </div>
    </div>
  );
};
