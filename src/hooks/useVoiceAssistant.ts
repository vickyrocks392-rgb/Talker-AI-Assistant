import { useState, useEffect, useRef } from "react";
import { VOICE_PERSONALITIES, findBestNativeVoice } from "../lib/voice-utils";
import { ISpeechRecognitionEvent } from "../types";

interface UseVoiceAssistantProps {
  onSpeechResult: (text: string) => void;
  isOnline: boolean;
}

export const useVoiceAssistant = ({ onSpeechResult, isOnline }: UseVoiceAssistantProps) => {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(() => {
    return localStorage.getItem("talker_selected_voice") || "us_female";
  });
  const [voiceType, setVoiceType] = useState<"native" | "gemini">("gemini");
  const [voiceSpeechEnabled, setVoiceSpeechEnabled] = useState<boolean>(true);
  const [handsFreeMode, setHandsFreeMode] = useState<boolean>(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [geminiQuotaExceeded, setGeminiQuotaExceeded] = useState<boolean>(false);

  // References to browser instances for proper teardown
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const voiceSpeechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Sync selected voice ID to local storage
  useEffect(() => {
    localStorage.setItem("talker_selected_voice", selectedVoiceId);
  }, [selectedVoiceId]);

  // Clean up references on unmount to prevent resource leaks and memory issues
  useEffect(() => {
    return () => {
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause();
        audioPlaybackRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopActiveSpeech = () => {
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
      audioPlaybackRef.current.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  };

  useEffect(() => {
    if (!voiceSpeechEnabled) {
      stopActiveSpeech();
    }
  }, [voiceSpeechEnabled]);

  const startVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError("Speech recognition is not supported in this browser. Please use Google Chrome.");
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      rec.onresult = (event: ISpeechRecognitionEvent) => {
        const resultText = event.results[0][0].transcript;
        if (resultText) {
          setIsListening(false);
          onSpeechResult(resultText);
        }
      };

      rec.onerror = (e: { error: string }) => {
        console.error("Speech capture error:", e);
        setIsListening(false);
        if (e.error !== "no-speech") {
          setSpeechError(`Voice capture issue: ${e.error}. Talk clearly into your microphone.`);
        }
        // Hands-free active recovery loop
        if (handsFreeMode && e.error === "no-speech") {
          setTimeout(() => {
            if (handsFreeMode) startVoiceCapture();
          }, 1500);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      console.error("Failed to run speech framework:", e);
      setIsListening(false);
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  const toggleHandsFree = () => {
    const isNowActive = !handsFreeMode;
    setHandsFreeMode(isNowActive);

    if (isNowActive) {
      setVoiceSpeechEnabled(true);
      startVoiceCapture();
    } else {
      stopVoiceCapture();
      stopActiveSpeech();
    }
  };

  const speakTextOutLoud = async (textToSpeak: string, messageId: string) => {
    if (speakingMessageId === messageId) {
      stopActiveSpeech();
      return;
    }

    stopActiveSpeech();

    setSpeakingMessageId(messageId);
    const personality =
      VOICE_PERSONALITIES.find((vp) => vp.id === selectedVoiceId) || VOICE_PERSONALITIES[0];

    // Fallback if native voice is selected or offline
    if (voiceType === "native" || !isOnline) {
      try {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.92;
        utterance.pitch = 1.0;

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

        utterance.onend = () => {
          setSpeakingMessageId(null);
          if (handsFreeMode) {
            startVoiceCapture();
          }
        };

        utterance.onerror = () => {
          setSpeakingMessageId(null);
        };

        voiceSpeechSynthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error("Local speech synthesis failed:", e);
        setSpeakingMessageId(null);
      }
    } else {
      // Cloud synthesis API
      try {
        const customKey = localStorage.getItem("custom_ollama_api_key") || "";
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...(customKey ? { "x-ollama-key": customKey } : {})
          },
          body: JSON.stringify({
            text: textToSpeak,
            voiceName: personality.geminiVoice,
          }),
        });

        const data = await response.json();

        if (data.error === "QUOTA_EXHAUSTED" || data.fallback) {
          setGeminiQuotaExceeded(true);
          setVoiceType("native");
          console.warn("Ollama Cloud TTS quota limit reached. Falling back to native local browser voice.");
          // Recursive retry using native voice
          speakTextOutLoud(textToSpeak, messageId);
          return;
        }

        if (!response.ok || !data.audio) {
          throw new Error(data.error || "Failed to generate AI natural audio.");
        }

        const audioUrl = `data:audio/wav;base64,${data.audio}`;
        const audio = new Audio(audioUrl);
        audioPlaybackRef.current = audio;

        audio.onended = () => {
          setSpeakingMessageId(null);
          if (handsFreeMode) {
            startVoiceCapture();
          }
        };

        audio.onerror = () => {
          setSpeakingMessageId(null);
        };

        await audio.play();
      } catch (err: any) {
        console.warn("Gemini Cloud TTS call error, performing native voice synthesis fallback:", err.message || err);
        setVoiceType("native");
        speakTextOutLoud(textToSpeak, messageId);
      }
    }
  };

  return {
    selectedVoiceId,
    setSelectedVoiceId,
    voiceType,
    setVoiceType,
    voiceSpeechEnabled,
    setVoiceSpeechEnabled,
    handsFreeMode,
    setHandsFreeMode,
    speakingMessageId,
    setSpeakingMessageId,
    isListening,
    speechError,
    setSpeechError,
    geminiQuotaExceeded,
    startVoiceCapture,
    stopVoiceCapture,
    toggleHandsFree,
    speakTextOutLoud,
    stopActiveSpeech,
  };
};
